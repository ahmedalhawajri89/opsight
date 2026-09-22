<?php

declare(strict_types=1);

namespace App\Domain\Payments;

use App\Domain\Orders\OrderStatus;
use App\Models\Order;
use App\Support\Money;

/**
 * Where an order stands on payment — derived, never stored (ADR-022).
 *
 *   outstanding = max(0, total − everything refunded − everything paid)
 *
 * Refunds count against what is owed: a returned item means less to collect,
 * whether or not money changed hands. A status column beside the ledger would
 * be a second source of truth that could drift from it; this cannot.
 *
 * Only a committed order owes anything. A draft or a cancelled order has no
 * payment status at all.
 */
enum PaymentStatus: string
{
    case Unpaid = 'unpaid';
    case PartiallyPaid = 'partially_paid';
    case Settled = 'settled';

    public static function outstanding(Order $order): string
    {
        $scale = Money::scale();
        $refunded = bcadd((string) $order->refunded_amount, (string) $order->refunded_vat_amount, $scale);
        $owed = bcsub(bcsub((string) $order->total_amount, $refunded, $scale), (string) $order->amount_paid, $scale);

        return bccomp($owed, '0', $scale) > 0 ? $owed : Money::zero();
    }

    public static function for(Order $order): ?self
    {
        if (! in_array($order->status->value, OrderStatus::qualifying(), true)) {
            return null;
        }

        $scale = Money::scale();

        if (bccomp(self::outstanding($order), '0', $scale) === 0) {
            return self::Settled;
        }

        return bccomp((string) $order->amount_paid, '0', $scale) > 0 ? self::PartiallyPaid : self::Unpaid;
    }

    public function label(): string
    {
        return __('labels.payment_status.'.$this->value);
    }

    /**
     * The same outstanding figure in SQL, over the orders table, for filtering
     * a listing and for summing receivables without loading every order.
     */
    public static function outstandingSql(string $table = 'orders'): string
    {
        return "GREATEST(0, {$table}.total_amount - {$table}.refunded_amount - {$table}.refunded_vat_amount - {$table}.amount_paid)";
    }
}
