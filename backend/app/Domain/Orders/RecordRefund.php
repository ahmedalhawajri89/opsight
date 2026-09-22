<?php

declare(strict_types=1);

namespace App\Domain\Orders;

use App\Domain\Inventory\StockLedger;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * Record a refund against a fulfilled order.
 *
 * A LEDGER (ADR-022), replacing the single overwritable refund of ADR-005: an
 * order may be refunded more than once, in parts, until everything it cost
 * the customer has been returned. Each refund is a row in order_refunds, and
 * the order's running totals — refunded_amount and refunded_vat_amount, which
 * every revenue figure reads — move in the same transaction, so no metric
 * changed.
 *
 * Stock goes back at most once per order. With no line-level refund data,
 * "return stock" means every line's full quantity; allowing it on a second
 * refund would put the same goods back on the shelf twice.
 *
 * Refund timing: a refund reduces the revenue of the period the order was
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
        ?string $reason = null,
    ): Order {
        return DB::transaction(function () use ($order, $amount, $returnStock, $actorId, $reason): Order {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);
            $scale = Money::scale();
            $amount = Money::round($amount);

            // The first refund moves a fulfilled order to refunded; later ones
            // add to an order that is refunded already.
            if ($order->status !== OrderStatus::Refunded && ! $order->status->canTransitionTo(OrderStatus::Refunded)) {
                throw OrderTransitionException::illegal($order->status, OrderStatus::Refunded);
            }

            $alreadyRefunded = bcadd((string) $order->refunded_amount, (string) $order->refunded_vat_amount, $scale);
            $refundable = bcsub((string) $order->total_amount, $alreadyRefunded, $scale);

            if (bccomp($amount, $refundable, $scale) > 0) {
                throw OrderTransitionException::refundExceedsTotal();
            }

            if ($returnStock && $order->stock_returned_at !== null) {
                throw OrderTransitionException::stockAlreadyReturned();
            }

            /*
             * `$amount` is what the customer gets back. When the order carried
             * tax, part of that is tax being returned, not revenue being lost:
             * it is split off in the order's own proportion of tax to total and
             * kept apart, so net revenue — which subtracts refunded_amount —
             * only falls by what the business had earned (ADR-013, ADR-018).
             */
            $vat = Money::zero();

            if (bccomp((string) $order->tax_amount, '0', $scale) > 0 && bccomp((string) $order->total_amount, '0', $scale) > 0) {
                $vat = Money::round(bcdiv(bcmul($amount, (string) $order->tax_amount, 10), (string) $order->total_amount, 10));
            }

            $revenue = bcsub($amount, $vat, $scale);

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

            $order->refunds()->create([
                'amount' => $revenue,
                'vat_amount' => $vat,
                'total' => $amount,
                'returned_stock' => $returnStock,
                'reason' => $reason,
                'refunded_at' => now(),
                'recorded_by' => $actorId,
            ]);

            $order->auditAs('order.refunded', ['amount' => $amount]);

            $order->forceFill([
                'status' => OrderStatus::Refunded,
                'refunded_at' => now(),
                'refunded_amount' => bcadd((string) $order->refunded_amount, $revenue, $scale),
                'refunded_vat_amount' => bcadd((string) $order->refunded_vat_amount, $vat, $scale),
                'stock_returned_at' => $returnStock ? now() : $order->stock_returned_at,
            ])->save();

            return $order->refresh();
        });
    }
}
