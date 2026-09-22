<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Domain\Inventory\StockLedger;
use App\Models\InventoryMovement;
use App\Models\Order;
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

            $items = $order->items()->with('product')->get();

            if ($items->isEmpty()) {
                throw OrderTransitionException::emptyOrder();
            }

            // The currency's own places: 2 for SAR, 3 for BHD (App\Support\Money).
            $scale = Money::scale();
            $subtotal = '0';
            $cogs = '0';

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
                 * nothing the order row does not.
                 */
                $item->withoutAudit()->forceFill([
                    'product_name' => $product->name,
                    'product_sku' => $product->sku,
                    'unit_price' => $unitPrice,
                    'unit_cost' => $unitCost,
                    'line_total' => $lineTotal,
                ])->save();

                $subtotal = bcadd($subtotal, $lineTotal, $scale);
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

            $total = bcadd(
                bcsub($subtotal, (string) $order->discount_amount, $scale),
                bcadd((string) $order->tax_amount, (string) $order->shipping_amount, $scale),
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
