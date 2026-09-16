<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Domain\Inventory\StockLedger;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
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

            $subtotal = '0.00';
            $cogs = '0.00';

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

                $item->forceFill([
                    'product_name' => $product->name,
                    'product_sku' => $product->sku,
                    'unit_price' => $unitPrice,
                    'unit_cost' => $unitCost,
                    'line_total' => $lineTotal,
                ])->save();

                $subtotal = bcadd($subtotal, $lineTotal, 2);
                $cogs = bcadd($cogs, $lineCogs, 2);

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
                bcsub($subtotal, (string) $order->discount_amount, 2),
                bcadd((string) $order->tax_amount, (string) $order->shipping_amount, 2),
                2,
            );

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

    /** Half-up to two places, on strings. Money never touches a PHP float. */
    private function round(string $value): string
    {
        $offset = bccomp($value, '0', 6) >= 0 ? '0.005' : '-0.005';

        return bcadd($value, $offset, 2);
    }
}
