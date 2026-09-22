<?php

declare(strict_types=1);

namespace App\Domain\Payments;

use App\Domain\Orders\OrderStatus;
use App\Models\Order;
use App\Support\Money;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Money received against an order (ADR-022).
 *
 * One transaction, under a row lock: the ledger row, and the order's running
 * amount_paid, so the two cannot disagree and two cashiers recording the same
 * payment at once cannot both succeed past what is owed.
 *
 * Only a committed order can be paid — confirmed, fulfilled or refunded.
 * Payment ahead of confirmation would be a deposit against goods not yet
 * committed, which Opsight does not model. And never more than is
 * outstanding: an overpayment is a different conversation with the customer,
 * not a figure to record against this order.
 */
final class RecordPayment
{
    public function __invoke(
        Order $order,
        string $amount,
        PaymentMethod $method,
        ?Carbon $paidAt = null,
        ?string $reference = null,
        ?int $actorId = null,
    ): Order {
        return DB::transaction(function () use ($order, $amount, $method, $paidAt, $reference, $actorId): Order {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);
            $scale = Money::scale();
            $amount = Money::round($amount);

            if (! in_array($order->status->value, OrderStatus::qualifying(), true)) {
                throw ValidationException::withMessages(['amount' => __('errors.payments.not_payable')]);
            }

            if (bccomp($amount, '0', $scale) <= 0) {
                throw ValidationException::withMessages(['amount' => __('errors.payments.not_positive')]);
            }

            if (bccomp($amount, PaymentStatus::outstanding($order), $scale) > 0) {
                throw ValidationException::withMessages(['amount' => __('errors.payments.exceeds_outstanding')]);
            }

            $order->payments()->create([
                'amount' => $amount,
                'method' => $method,
                'paid_at' => $paidAt ?? now(),
                'reference' => $reference,
                'recorded_by' => $actorId,
            ]);

            $order->auditAs('order.payment_recorded', ['amount' => $amount, 'method' => $method->value]);

            $order->forceFill([
                'amount_paid' => bcadd((string) $order->amount_paid, $amount, $scale),
            ])->save();

            return $order->refresh();
        });
    }
}
