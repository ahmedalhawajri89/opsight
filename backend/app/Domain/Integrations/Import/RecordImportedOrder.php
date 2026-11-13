<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Import;

use App\Domain\Audit\AuditRecorder;
use App\Domain\Orders\OrderReference;
use App\Domain\Orders\OrderStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Writes an order from any connected store (ADR-029, ADR-037).
 *
 * Moved here from the Salla importer unchanged in behaviour, so that the
 * rules below exist once rather than once per store and cannot drift apart.
 *
 * IDEMPOTENT BY CONSTRUCTION. Stores retry deliveries, an order is updated
 * several times through its life, and a backfill may cover ground a webhook
 * already covered. Every row this writes is found by `(source, external_id)`
 * first — the pair ADR-027 put on these three tables for exactly this — so
 * running it twice on the same order updates one row rather than making two.
 *
 * IT DOES NOT MOVE STOCK, and that is the decision most likely to look like
 * an omission. The store is the system of record for its own shelves: it has
 * already decremented them. An importer that also decremented would show
 * every imported sale leaving stock twice (ADR-027).
 *
 * IT DOES NOT GO THROUGH `ConfirmOrder` either, for the same reason — that
 * service prices an order from the local catalogue and moves stock, and both
 * are wrong for a record that arrives already priced.
 */
final class RecordImportedOrder
{
    public function __construct(private readonly AuditRecorder $recorder) {}

    public function __invoke(ImportedOrder $imported): Order
    {
        return DB::transaction(function () use ($imported): Order {
            $customer = $this->customer($imported->source, $imported->customer);

            $order = Order::query()
                ->where('source', $imported->source)
                ->where('external_id', $imported->externalId)
                ->first();

            $isNew = $order === null;

            if ($isNew) {
                /*
                 * Created through OrderReference so an imported order carries
                 * a reference in the same series as one typed in here. A
                 * business reads one list of orders, not two.
                 */
                $order = OrderReference::createOrder([]);

                /*
                 * Set immediately, and not through createOrder's attributes:
                 * `source` and `external_id` are not fillable on Order, so
                 * passing them there would drop them in silence and the next
                 * delivery would make a second order. Written inside the same
                 * transaction so the unique index on
                 * (business_id, source, external_id) can refuse a concurrent
                 * import of the same order — the job retries, and the retry
                 * finds the row.
                 */
                $order->forceFill(['source' => $imported->source, 'external_id' => $imported->externalId])->save();
            }

            $cogs = $this->lines($order, $imported);
            $this->totals($order, $imported, $customer, $cogs);
            $this->payments($order, $imported);

            $this->recorder->record(
                action: $isNew ? 'order.imported' : 'order.reimported',
                subject: $order,
                context: ['source' => $imported->source, 'external_id' => $imported->externalId]
                    + $imported->context
                    + ['status' => $imported->status->value],
            );

            return $order->refresh();
        });
    }

    /**
     * The person who placed it, found or created. None is a walk-in, which
     * is what a store with guest checkout sends.
     */
    private function customer(string $source, ?ImportedCustomer $imported): ?Customer
    {
        if ($imported === null) {
            return null;
        }

        $customer = Customer::query()
            ->where('source', $source)
            ->where('external_id', $imported->externalId)
            ->first();

        /*
         * The same person reached through another door: a second store, a
         * second platform, or entered by hand. One email is one customer in
         * a business (the table says so), so the order joins that person,
         * and what they were already called here is left as it is.
         */
        if ($customer === null && $imported->email !== null) {
            $known = Customer::query()->where('email', $imported->email)->first();

            if ($known !== null) {
                return $known;
            }
        }

        if ($customer === null) {
            $customer = new Customer;
            $customer->forceFill(['source' => $source, 'external_id' => $imported->externalId]);
        }

        /*
         * An erased customer is not re-populated by a later delivery. The
         * whole point of an erasure is that the person stops being
         * identifiable; an import that wrote their name back would undo it
         * silently, on a schedule (ADR-026).
         */
        if ($customer->exists && $customer->erased_at !== null) {
            return $customer;
        }

        $customer->forceFill($imported->attributes())->save();

        return $customer;
    }

    /**
     * The product behind one line, found or created.
     *
     * Matched on the store's product id first, then on SKU — a store entered
     * here by hand before it was connected has products with the same SKUs,
     * and making second copies of them would split every figure that groups
     * by product.
     */
    private function product(string $source, ImportedLine $line): ?Product
    {
        $product = null;

        if ($line->productExternalId !== null) {
            $product = Product::query()
                ->where('source', $source)
                ->where('external_id', $line->productExternalId)
                ->first();
        }

        if ($product === null && $line->productSku !== null) {
            $product = Product::query()->where('sku', $line->productSku)->first();
        }

        if ($product !== null) {
            return $product;
        }

        if ($line->productSku === null) {
            // Nothing to identify it by. The line still imports, carrying its
            // name and price; it simply groups under no product.
            return null;
        }

        $product = new Product;
        $product->forceFill([
            'source' => $source,
            'external_id' => $line->productExternalId,
            'sku' => $line->productSku,
            'name' => $line->productName,
            'price' => $line->productPrice,
            /*
             * Cost is zero, and that is honest rather than lazy: an order
             * payload carries no cost, so margin on a product first seen
             * through an order is unknown until the catalogue pass or the
             * owner fills it in (ADR-030). A guessed cost would produce a
             * margin figure that looks authoritative and is not.
             */
            'cost' => '0',
            'is_active' => true,
        ]);
        $product->save();

        return $product;
    }

    /**
     * The lines, replaced wholesale on every import.
     *
     * Stores send an order's current state, not a diff, so the lines are
     * rewritten rather than reconciled one by one. Safe because an imported
     * order is never edited here — the store owns it.
     */
    private function lines(Order $order, ImportedOrder $imported): string
    {
        if ($imported->lines === null) {
            /*
             * The delivery said nothing about lines. The stored ones stay —
             * deleting them would turn a bare status update into an order
             * that sold nothing.
             */
            return '0';
        }

        $order->items()->delete();
        $cogs = '0';

        foreach ($imported->lines as $line) {
            $product = $this->product($imported->source, $line);

            $order->items()->create([
                'product_id' => $product?->id,
                'product_name' => mb_substr($line->name ?? $product->name ?? $line->fallbackName, 0, 180),
                'product_sku' => mb_substr($line->sku ?? $product->sku ?? '', 0, 64),
                'unit_price' => Money::round(bcdiv($line->lineTotal, (string) $line->quantity, 4)),
                /*
                 * The product's cost at the moment of import, snapshotted
                 * onto the line like every other order in the system. Known
                 * only because the catalogue pass ran first (ADR-030); a
                 * product it has not reached yet costs zero, which reads as
                 * an unknown margin rather than a hundred-percent one.
                 */
                'unit_cost' => Money::round((string) ($product->cost ?? '0'), 4),
                'quantity' => $line->quantity,
                'line_discount' => Money::round($line->discount),
                'line_total' => Money::round($line->lineTotal),
            ]);

            $cogs = bcadd(
                $cogs,
                bcmul((string) ($product->cost ?? '0'), (string) $line->quantity, 4),
                4,
            );
        }

        return $cogs;
    }

    private function totals(Order $order, ImportedOrder $imported, ?Customer $customer, string $cogs): void
    {
        $status = $imported->status;
        $placedAt = $imported->placedAt;

        $order->withoutAudit()->forceFill([
            'customer_id' => $customer?->id,
            'status' => $status->value,
            'placed_at' => $status === OrderStatus::Draft ? null : $placedAt,
            'fulfilled_at' => $status === OrderStatus::Fulfilled ? $placedAt : null,
            'cancelled_at' => $status === OrderStatus::Cancelled ? $placedAt : null,
            'cancellation_reason' => $status === OrderStatus::Cancelled ? $imported->cancellationReason : null,
            'subtotal_amount' => Money::round($imported->subtotal),
            'discount_amount' => Money::round($imported->discount),
            'tax_amount' => Money::round($imported->tax),
            'shipping_amount' => Money::round($imported->shipping),
            'total_amount' => Money::round($imported->total),
            /*
             * Summed from the lines, which took it from the catalogue. Unlike
             * the other totals this is NOT the store's figure, because no
             * store reports one.
             */
            'cogs_amount' => Money::round($cogs),
        ])->save();
    }

    /**
     * What was paid, replaced wholesale like the lines.
     *
     * Recorded only for an order that has been committed: a draft has
     * nothing to owe against.
     */
    private function payments(Order $order, ImportedOrder $imported): void
    {
        $order->payments()->delete();

        if ($order->status === OrderStatus::Draft) {
            return;
        }

        foreach ($imported->payments as $entry) {
            if (bccomp($entry->amount, '0', Money::scale()) <= 0) {
                continue;
            }

            $payment = $order->payments()->create([
                'amount' => Money::round($entry->amount),
                'method' => $entry->method->value,
                'paid_at' => $order->placed_at ?? now(),
                'reference' => $entry->reference !== null ? mb_substr($entry->reference, 0, 80) : null,
            ]);

            /*
             * Forced rather than mass-assigned: `is_backfill` is deliberately
             * not fillable, so it can never be set from a request. It is true
             * here for the reason the flag exists — the money changed hands
             * elsewhere and is being recorded after the fact (ADR-022).
             */
            $payment->forceFill(['is_backfill' => true])->save();
        }
    }
}
