<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Domain\Inventory\StockLedger;
use App\Domain\Tax\VatCalculation;
use App\Models\BusinessSetting;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * The commitment point.
 *
 * This is the single most important operation in the system. At this instant,
 * and inside ONE transaction:
 *
 *   1. price, cost, name and SKU are SNAPSHOTTED onto every line,
 *   2. stock is decremented through the ledger,
 *   3. totals and COGS are frozen,
 *   4. placed_at is set — the business date every metric ranges on.
 *
 * The snapshot in step 1 is what makes a price change tomorrow unable to
 * rewrite this order's margin. Everything else in the product depends on it
 * being correct (MVP_SCOPE.md §5).
 *
 * If any step fails the whole thing rolls back: there is no partial confirm,
 * and no stock is decremented for an order that did not commit.
 */
final class ConfirmOrder
{
    public function __construct(private readonly StockLedger $ledger) {}

    public function __invoke(Order $order, ?int $actorId = null): Order
    {
        return DB::transaction(function () use ($order, $actorId): Order {
            /*
             * Re-read the order under a lock and re-check the transition.
             *
             * Two users confirming the same order race here; the loser sees the
             * already-confirmed state and gets a 409 rather than double-
             * decrementing stock (ARCHITECTURE.md §7).
             */
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (! $order->status->canTransitionTo(OrderStatus::Confirmed)) {
                throw OrderTransitionException::illegal($order->status, OrderStatus::Confirmed);
            }

            $items = $order->items()->with('product')->orderBy('product_id')->get();

            if ($items->isEmpty()) {
                throw OrderTransitionException::emptyOrder();
            }

            // The currency's own places: 2 for SAR, 3 for BHD (App\Support\Money).
            $scale = Money::scale();
            $settings = BusinessSetting::current();
            $vatEnabled = (bool) $settings->vat_enabled;
            $subtotal = '0';
            $cogs = '0';

            /** @var list<array{item: OrderItem, shelf: string, rate: string}> $lines */
            $lines = [];

            foreach ($items as $item) {
                /** @var Product|null $product */
                $product = $item->product;

                if ($product === null) {
                    throw OrderTransitionException::illegal($order->status, OrderStatus::Confirmed);
                }

                /*
                 * THE SNAPSHOT. Copied from the catalog now, and never read
                 * from the catalog again.
                 */
                $unitPrice = (string) $product->price;
                $unitCost = (string) $product->cost;

                // Rounded at the LINE, then summed — what an invoice does, and
                // what avoids a totals-drift bug class (DATABASE_DESIGN.md §2).
                $lineGross = $this->round(bcmul($unitPrice, (string) $item->quantity, 6));
                $lineTotal = $this->round(bcsub($lineGross, (string) $item->line_discount, 6));
                $lineCogs = $this->round(bcmul($unitCost, (string) $item->quantity, 6));

                /*
                 * The snapshot write is part of confirming, not an edit of
                 * the line. `order.confirmed` already records it; a row per
                 * line here would multiply the log by basket size and say
                 * nothing the order row does not. `line_total` is written
                 * below, once VAT is known.
                 */
                $item->forceFill([
                    'product_name' => $product->name,
                    'product_name_ar' => $product->name_ar,
                    'product_sku' => $product->sku,
                    'unit_price' => $unitPrice,
                    'unit_cost' => $unitCost,
                ]);

                $lines[] = [
                    'item' => $item,
                    'shelf' => $lineTotal,
                    // NULL on the product follows the business rate; 0 is zero-rated.
                    'rate' => $vatEnabled ? (string) ($product->vat_rate ?? $settings->vat_rate) : '0',
                ];

                $cogs = bcadd($cogs, $lineCogs, $scale);

                // Decrements under a row lock; throws if stock is insufficient,
                // which rolls the entire confirm back.
                $this->ledger->move(
                    product: $product,
                    delta: -$item->quantity,
                    reason: InventoryMovement::REASON_SALE,
                    referenceType: 'order',
                    referenceId: $order->id,
                    actorId: $actorId,
                );
            }

            /*
             * VAT (ADR-018). With it on, every stored amount becomes EXCLUDING
             * VAT — line totals, subtotal and the order discount — so revenue,
             * which has always excluded tax (ADR-013), stays correct without
             * any metric changing. The VAT is snapshotted per line and summed
             * into tax_amount, replacing the typed-in figure. With it off,
             * nothing differs from before: shelf amounts are the line totals
             * and the order's tax is whatever was entered.
             */
            $discount = (string) $order->discount_amount;
            $tax = (string) $order->tax_amount;

            if ($vatEnabled) {
                $vat = VatCalculation::calculate(
                    array_map(fn (array $line): array => ['shelf' => $line['shelf'], 'rate' => $line['rate']], $lines),
                    $discount,
                    (bool) $settings->prices_include_vat,
                    $scale,
                );
                $discount = $vat['discount_net'];
                $tax = $vat['vat_total'];
            }

            foreach ($lines as $index => $line) {
                $snapshot = $vatEnabled
                    ? [
                        'line_total' => $vat['lines'][$index]['net'],
                        'vat_rate' => $vat['lines'][$index]['rate'],
                        'vat_taxable_amount' => $vat['lines'][$index]['taxable'],
                        'vat_amount' => $vat['lines'][$index]['vat'],
                    ]
                    : ['line_total' => $line['shelf']];

                $line['item']->withoutAudit()->forceFill($snapshot)->save();
                $subtotal = bcadd($subtotal, $snapshot['line_total'], $scale);
            }

            /*
             * A discount may take an order to nothing; it may not take it
             * below nothing. Without this an order could be confirmed with a
             * NEGATIVE total, which subtracts from revenue, makes "outstanding"
             * meaningless and gives a refund a limit below zero. Checked here
             * rather than at the request, because the subtotal it must be
             * measured against does not exist until the lines are priced.
             */
            if (bccomp($discount, $subtotal, $scale) > 0) {
                throw OrderTransitionException::discountExceedsSubtotal();
            }

            $total = bcadd(
                bcsub($subtotal, $discount, $scale),
                bcadd($tax, (string) $order->shipping_amount, $scale),
                $scale,
            );

            /*
             * Named for the audit log before the write, so the row reads
             * `order.confirmed` rather than `order.updated`. The line-item
             * snapshot values are deliberately not repeated into the context:
             * they are on the order_items rows, permanently, and copying
             * costs into a table Staff can read would leak them.
             */
            $order->auditAs('order.confirmed', ['lines' => $items->count()]);

            $order->forceFill([
                'status' => OrderStatus::Confirmed,
                'placed_at' => now(),
                'subtotal_amount' => $subtotal,
                'discount_amount' => $discount,
                'tax_amount' => $tax,
                'prices_include_vat' => $vatEnabled && (bool) $settings->prices_include_vat,
                'total_amount' => $total,
                'cogs_amount' => $cogs,
            ])->save();

            return $order->refresh();
        });
    }

    /** Half-up to the currency's places, on strings. Money never touches a PHP float. */
    private function round(string $value): string
    {
        return Money::round($value);
    }
}
