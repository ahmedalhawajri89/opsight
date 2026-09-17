<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Domain\Inventory\StockLedger;
use App\Models\InventoryMovement;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

/**
 * Record a refund against a fulfilled order.
 *
 * MVP scope (ADR-005): one refund per order, full or partial, stored as two
 * columns rather than a ledger. The limitation is real and documented — a
 * second refund cannot be recorded without overwriting the first, and Units
 * Sold is not reduced because there is no line-level refund data.
 *
 * Refund timing: the refund reduces the revenue of the period the order was
 * PLACED in, not the period the refund was issued. That keeps an order's
 * economics on one row and in one period, at the cost of a closed period's
 * figure being able to move (METRICS.md §2.2).
 */
final class RecordRefund
{
    public function __construct(private readonly StockLedger $ledger) {}

    public function __invoke(
        Order $order,
        string $amount,
        bool $returnStock = true,
        ?int $actorId = null,
    ): Order {
        return DB::transaction(function () use ($order, $amount, $returnStock, $actorId): Order {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (! $order->status->canTransitionTo(OrderStatus::Refunded)) {
                throw OrderTransitionException::illegal($order->status, OrderStatus::Refunded);
            }

            if (bccomp($amount, (string) $order->total_amount, 2) > 0) {
                throw OrderTransitionException::refundExceedsTotal();
            }

            /*
             * Returning stock is a choice, not an assumption. Goods refunded
             * because they were damaged do not go back on the shelf, and
             * silently restocking them would overstate what is sellable.
             */
            if ($returnStock) {
                foreach ($order->items()->with('product')->get() as $item) {
                    if ($item->product === null) {
                        continue;
                    }

                    $this->ledger->move(
                        product: $item->product,
                        delta: $item->quantity,
                        reason: InventoryMovement::REASON_SALE_REFUNDED,
                        referenceType: 'order',
                        referenceId: $order->id,
                        actorId: $actorId,
                    );
                }
            }

            $order->auditAs('order.refunded', ['amount' => $amount]);

            $order->forceFill([
                'status' => OrderStatus::Refunded,
                'refunded_at' => now(),
                'refunded_amount' => $amount,
            ])->save();

            return $order->refresh();
        });
    }
}
