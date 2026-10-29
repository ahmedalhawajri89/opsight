<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Domain\Audit\AuditRecorder;
use App\Domain\Orders\OrderReference;
use App\Domain\Orders\OrderStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Support\Money;
use App\Support\PhoneNumber;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * One Salla order, as an Opsight order (ADR-029).
 *
 * IDEMPOTENT BY CONSTRUCTION. Salla retries deliveries, an order is updated
 * several times through its life, and a backfill may cover ground a webhook
 * already covered. Every row this writes is found by `(source, external_id)`
 * first — the pair ADR-027 put on these three tables for exactly this — so
 * running it twice on the same order updates one row rather than making two.
 *
 * IT DOES NOT MOVE STOCK, and that is the decision most likely to look like
 * an omission. The store is the system of record for its own shelves: it has
 * already decremented them, and the quantities arrive from it. An importer
 * that also decremented would show every imported sale leaving stock twice
 * (ADR-027). The ledger keeps its invariant because nothing is claimed to
 * have moved here.
 *
 * IT DOES NOT GO THROUGH `ConfirmOrder` either, for the same reason — that
 * service exists to price an order from the local catalogue and move stock,
 * and both are wrong for a record that arrives already priced. The totals
 * are Salla's own, which is what makes reconciliation meaningful: if this
 * recomputed them, `opsight:salla:reconcile` would be comparing our
 * arithmetic against itself.
 */
final class ImportSallaOrder
{
    public const SOURCE = 'salla';

    public function __construct(private readonly AuditRecorder $recorder) {}

    /**
     * @param  array<string, mixed>  $payload  the order, as Salla sends it
     */
    public function __invoke(array $payload): Order
    {
        $externalId = SallaMap::externalId($payload);
        $status = SallaMap::status($payload);

        return DB::transaction(function () use ($payload, $externalId, $status): Order {
            $customer = $this->customer($payload['customer'] ?? null);

            $order = Order::query()
                ->where('source', self::SOURCE)
                ->where('external_id', $externalId)
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
                $order->forceFill(['source' => self::SOURCE, 'external_id' => $externalId])->save();
            }

            $this->lines($order, $payload['items'] ?? []);
            $this->totals($order, $payload, $status, $customer);
            $this->payment($order, $payload);

            $this->recorder->record(
                action: $isNew ? 'order.imported' : 'order.reimported',
                subject: $order,
                context: [
                    'source' => self::SOURCE,
                    'external_id' => $externalId,
                    'reference_id' => $payload['reference_id'] ?? null,
                    'status' => $status->value,
                ],
            );

            return $order->refresh();
        });
    }

    /**
     * The person who placed it, found or created.
     *
     * A store with guest checkout sends no customer, and that is a walk-in
     * here — the same thing the order screen means by leaving it empty.
     */
    private function customer(mixed $node): ?Customer
    {
        if (! is_array($node)) {
            return null;
        }

        $externalId = isset($node['id']) && is_scalar($node['id']) ? (string) $node['id'] : null;

        if ($externalId === null) {
            return null;
        }

        $name = trim(((string) ($node['first_name'] ?? '')).' '.((string) ($node['last_name'] ?? '')));

        /*
         * The phone arrives split: `mobile_code` is "+966" and `mobile` is
         * the rest, often as an INTEGER, which drops any leading zero. Joined
         * and normalised to E.164 by the same class the forms use (ADR-021),
         * and left null rather than stored malformed if it cannot be placed.
         */
        $phone = null;
        $mobile = $node['mobile'] ?? null;

        if (is_scalar($mobile) && (string) $mobile !== '') {
            $phone = PhoneNumber::normalize(
                ((string) ($node['mobile_code'] ?? '')).(string) $mobile,
                is_string($node['country_code'] ?? null) ? $node['country_code'] : null,
            );
        }

        $attributes = array_filter([
            'name' => $name !== '' ? $name : 'Salla customer '.$externalId,
            'email' => is_string($node['email'] ?? null) ? $node['email'] : null,
            'phone' => $phone,
            'city' => is_string($node['city'] ?? null) ? $node['city'] : null,
            'country' => is_string($node['country_code'] ?? null) ? strtoupper($node['country_code']) : null,
        ], static fn ($value): bool => $value !== null && $value !== '');

        $customer = Customer::query()
            ->where('source', self::SOURCE)
            ->where('external_id', $externalId)
            ->first();

        if ($customer === null) {
            $customer = new Customer;
            $customer->forceFill(['source' => self::SOURCE, 'external_id' => $externalId]);
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

        $customer->forceFill($attributes)->save();

        return $customer;
    }

    /**
     * The product behind one line, found or created.
     *
     * Matched on Salla's product id first, then on SKU — a store that was
     * entered here by hand before it was connected has products with the
     * same SKUs, and making second copies of them would split every figure
     * that groups by product.
     *
     * @param  array<string, mixed>  $item
     */
    private function product(array $item): ?Product
    {
        $node = is_array($item['product'] ?? null) ? $item['product'] : [];
        $externalId = isset($node['id']) && is_scalar($node['id']) ? (string) $node['id'] : null;
        $sku = $this->sku($item, $node);

        $product = null;

        if ($externalId !== null) {
            $product = Product::query()
                ->where('source', self::SOURCE)
                ->where('external_id', $externalId)
                ->first();
        }

        if ($product === null && $sku !== null) {
            $product = Product::query()->where('sku', $sku)->first();
        }

        if ($product !== null) {
            return $product;
        }

        if ($sku === null) {
            // Nothing to identify it by. The line still imports, carrying its
            // name and price; it simply groups under no product.
            return null;
        }

        $product = new Product;
        $product->forceFill([
            'source' => self::SOURCE,
            'external_id' => $externalId,
            'sku' => $sku,
            'name' => (string) ($item['name'] ?? $node['name'] ?? $sku),
            'price' => SallaMap::money($node['price'] ?? null, '0'),
            /*
             * Cost is zero, and that is honest rather than lazy: Salla's
             * order payload carries no cost, so margin on imported orders is
             * unknown until the owner fills it in. A guessed cost would
             * produce a margin figure that looks authoritative and is not.
             */
            'cost' => '0',
            'is_active' => true,
        ]);
        $product->save();

        return $product;
    }

    /**
     * @param  array<string, mixed>  $item
     * @param  array<string, mixed>  $node
     */
    private function sku(array $item, array $node): ?string
    {
        foreach ([$item['sku'] ?? null, $node['sku'] ?? null] as $candidate) {
            if (is_scalar($candidate) && (string) $candidate !== '') {
                return mb_substr((string) $candidate, 0, 64);
            }
        }

        return null;
    }

    /**
     * The lines, replaced wholesale on every import.
     *
     * Salla sends the order's current state, not a diff, so the lines are
     * rewritten rather than reconciled one by one. Safe because an imported
     * order is never edited here — the store owns it.
     */
    private function lines(Order $order, mixed $items): void
    {
        if (! is_array($items)) {
            return;
        }

        $order->items()->delete();

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $product = $this->product($item);
            $quantity = max(1, (int) ($item['quantity'] ?? 1));
            $amounts = is_array($item['amounts'] ?? null) ? $item['amounts'] : [];

            /*
             * `price_without_tax` is the line before tax; `total` is after
             * it. The unit price is taken from the pre-tax figure so a line
             * reads the way the catalogue does, and VAT stays on the order.
             */
            $lineTotal = SallaMap::money($amounts['price_without_tax'] ?? null, null)
                ?? SallaMap::money($amounts['total'] ?? null, '0');

            $discount = SallaMap::money($amounts['total_discount'] ?? null, '0');

            $order->items()->create([
                'product_id' => $product?->id,
                'product_name' => mb_substr((string) ($item['name'] ?? $product->name ?? 'Salla item'), 0, 180),
                'product_sku' => mb_substr((string) ($item['sku'] ?? $product->sku ?? ''), 0, 64),
                'unit_price' => Money::round(bcdiv((string) $lineTotal, (string) $quantity, 4)),
                // Unknown, as above: Salla does not send what the item cost.
                'unit_cost' => '0',
                'quantity' => $quantity,
                'line_discount' => Money::round((string) $discount),
                'line_total' => Money::round((string) $lineTotal),
            ]);
        }
    }

    /**
     * Salla's own totals, written as they arrived.
     *
     * Not recomputed from the lines. If this recalculated them, the
     * reconciler would be comparing our arithmetic with itself and would
     * never find the drift it exists to find.
     *
     * @param  array<string, mixed>  $payload
     */
    private function totals(Order $order, array $payload, OrderStatus $status, ?Customer $customer): void
    {
        $amounts = is_array($payload['amounts'] ?? null) ? $payload['amounts'] : [];

        $subtotal = SallaMap::money($amounts['sub_total'] ?? null, '0');
        $shipping = SallaMap::money($amounts['shipping_cost'] ?? null, '0');
        $total = SallaMap::money($amounts['total'] ?? null, '0');
        $tax = SallaMap::money(($amounts['tax']['amount'] ?? null), '0');

        $discount = '0';

        foreach ((array) ($amounts['discounts'] ?? []) as $line) {
            if (is_array($line) && isset($line['discount']) && is_numeric($line['discount'])) {
                $discount = bcadd($discount, (string) $line['discount'], Money::scale());
            }
        }

        $placedAt = $this->placedAt($payload);

        $order->withoutAudit()->forceFill([
            'customer_id' => $customer?->id,
            'status' => $status->value,
            'placed_at' => $status === OrderStatus::Draft ? null : $placedAt,
            'fulfilled_at' => $status === OrderStatus::Fulfilled ? $placedAt : null,
            'cancelled_at' => $status === OrderStatus::Cancelled ? $placedAt : null,
            'cancellation_reason' => $status === OrderStatus::Cancelled ? 'Cancelled in Salla' : null,
            'subtotal_amount' => Money::round((string) $subtotal),
            'discount_amount' => Money::round($discount),
            'tax_amount' => Money::round((string) $tax),
            'shipping_amount' => Money::round((string) $shipping),
            'total_amount' => Money::round((string) $total),
            // Unknown until the owner prices the products. Margin on an
            // imported order is absent rather than invented.
            'cogs_amount' => '0',
        ])->save();
    }

    /** @param array<string, mixed> $payload */
    private function placedAt(array $payload): Carbon
    {
        $date = $payload['date']['date'] ?? null;
        $zone = $payload['date']['timezone'] ?? null;

        if (is_string($date) && $date !== '') {
            return Carbon::parse($date, is_string($zone) ? $zone : 'UTC')->utc();
        }

        return Carbon::now();
    }

    /**
     * What was paid, recorded once.
     *
     * Salla sends `payment_methods` as a list — an order can be part wallet,
     * part card — so each entry becomes its own payment row, which is what
     * the ledger is shaped for (ADR-022). Recorded only for an order that
     * has been committed: a draft has nothing to owe against.
     *
     * @param  array<string, mixed>  $payload
     */
    private function payment(Order $order, array $payload): void
    {
        /*
         * Every payment on an imported order is Salla's, so they are replaced
         * wholesale like the lines. `order_payments` has no `source` column —
         * nothing here is entered by hand, so it needs none.
         */
        $order->payments()->delete();

        if ($order->status === OrderStatus::Draft) {
            return;
        }

        $entries = is_array($payload['payment_methods'] ?? null) ? $payload['payment_methods'] : [];

        if ($entries === []) {
            $method = SallaMap::paymentMethod(is_string($payload['payment_method'] ?? null) ? $payload['payment_method'] : null);
            $entries = [['amount' => $payload['amounts']['total']['amount'] ?? 0, 'payment_method' => $method->value]];
        }

        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $amount = SallaMap::money($entry['amount'] ?? null, '0');

            if (bccomp((string) $amount, '0', Money::scale()) <= 0) {
                continue;
            }

            $raw = is_string($entry['payment_method'] ?? null) ? $entry['payment_method'] : null;

            $payment = $order->payments()->create([
                'amount' => Money::round((string) $amount),
                'method' => SallaMap::paymentMethod($raw)->value,
                'paid_at' => $order->placed_at ?? now(),
                // Salla's own word for the method, kept so nothing is lost
                // when it maps to `other`.
                'reference' => $raw !== null ? mb_substr($raw, 0, 80) : null,
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
