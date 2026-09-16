<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Models\Order;
use Illuminate\Support\Facades\DB;

/**
 * Mark a confirmed order as delivered.
 *
 * Deliberately does NOT touch stock. The decrement happened at confirm, which
 * is the commitment point; fulfilment records that the goods left, not that
 * they were sold. Decrementing again here is the obvious mistake this comment
 * exists to prevent.
 */
final class FulfilOrder
{
    public function __invoke(Order $order): Order
    {
        return DB::transaction(function () use ($order): Order {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);

            if (! $order->status->canTransitionTo(OrderStatus::Fulfilled)) {
                throw OrderTransitionException::illegal($order->status, OrderStatus::Fulfilled);
            }

            $order->forceFill([
                'status' => OrderStatus::Fulfilled,
                'fulfilled_at' => now(),
            ])->save();

            return $order->refresh();
        });
    }
}
