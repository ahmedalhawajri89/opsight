<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Domain\Inventory\StockLedger;
use App\Models\InventoryMovement;
use App\Models\Order;
use Illuminate\Support\Facades\DB;

/**
 * Cancel an order and return its stock.
 *
 * The order is NOT deleted. It stays on record as cancelled, because it is a
 * fact that happened and because the Cancellation Rate metric needs it
 * (METRICS.md §2.11).
 *
 * Stock is returned by a COMPENSATING ledger entry, never by editing or
 * removing the original movement — so the ledger shows both the sale and its
 * reversal, which is what makes it auditable.
 */
final class CancelOrder
{
    public function __construct(private readonly StockLedger $ledger) {}

    public function __invoke(Order $order, string $reason, ?int $actorId = null): Order
    {
        $reason = trim($reason);

        if ($reason === '') {
            throw OrderTransitionException::reasonRequired();
        }

        return DB::transaction(function () use ($order, $reason, $actorId): Order {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (! $order->status->canTransitionTo(OrderStatus::Cancelled)) {
                throw OrderTransitionException::illegal($order->status, OrderStatus::Cancelled);
            }

            // Only return stock that was actually taken. A draft never held any.
            if ($order->status->holdsStock()) {
                foreach ($order->items()->with('product')->get() as $item) {
                    if ($item->product === null) {
                        continue;
                    }

                    $this->ledger->move(
                        product: $item->product,
                        delta: $item->quantity,
                        reason: InventoryMovement::REASON_SALE_CANCELLED,
                        referenceType: 'order',
                        referenceId: $order->id,
                        note: "Cancelled: {$reason}",
                        actorId: $actorId,
                    );
                }
            }

            $order->forceFill([
                'status' => OrderStatus::Cancelled,
                'cancelled_at' => now(),
                'cancellation_reason' => $reason,
            ])->save();

            return $order->refresh();
        });
    }
}
