<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use RuntimeException;

/**
 * Turning Salla's vocabulary into this system's (ADR-029).
 *
 * THIS CLASS DECIDES WHAT EVERY IMPORTED ORDER MEANS TO THE FIGURES, which
 * makes it the most consequential file in the importer and the one most worth
 * arguing with. A status mapped one step too generously turns an unpaid
 * basket into revenue; one step too meanly hides a month of real trade.
 *
 * Pure: arrays and enums in, arrays and enums out. No database, no HTTP.
 *
 * WHERE THE VALUES COME FROM. The status list is Salla's own, read from its
 * List Order Statuses documentation, not inferred from a test store:
 * payment_pending, waiting_for_payment_confirmation, payment_failed,
 * in_progress, under_review, completed, delivering, delivered, shipped,
 * canceled, restored, restoring. Note `canceled`, one L — Salla's spelling,
 * and a typo here would silently count cancellations as sales.
 */
final class SallaMap
{
    /**
     * Salla's status slug to ours.
     *
     * THE LINE IS "HAS THE MERCHANT COMMITTED?", not "has the money arrived".
     * Opsight counts a confirmed order as revenue and tracks what is still
     * owed separately (ADR-022), so an unpaid order is confirmed-and-unpaid
     * rather than invisible. That is the same thing the product does for an
     * order typed in by hand with cash due on delivery.
     *
     * The exception is the states where the merchant has NOT committed:
     *
     * `payment_pending` and `waiting_for_payment_confirmation` are baskets
     * awaiting money, and `payment_failed` is one that never arrived. In
     * Salla they are orders; here they are drafts, which count toward
     * nothing. Treating them as revenue would book sales for abandoned
     * checkouts — the single most flattering mistake an importer can make,
     * and the hardest to notice because the figures only ever look good.
     *
     * `restoring` and `restored` mean an order came back to the store after
     * a cancellation. Opsight has no such state: what matters to the figures
     * is that it is live trade again, so it is confirmed.
     *
     * @return array<string, OrderStatus>
     */
    public static function statuses(): array
    {
        return [
            // Not yet a commitment.
            'payment_pending' => OrderStatus::Draft,
            'waiting_for_payment_confirmation' => OrderStatus::Draft,
            'payment_failed' => OrderStatus::Draft,

            // Committed, being worked.
            'under_review' => OrderStatus::Confirmed,
            'in_progress' => OrderStatus::Confirmed,
            'shipped' => OrderStatus::Confirmed,
            'delivering' => OrderStatus::Confirmed,
            'restoring' => OrderStatus::Confirmed,
            'restored' => OrderStatus::Confirmed,

            // Done.
            'delivered' => OrderStatus::Fulfilled,
            'completed' => OrderStatus::Fulfilled,

            // Reversed. Salla spells it with one L.
            'canceled' => OrderStatus::Cancelled,
            'cancelled' => OrderStatus::Cancelled,
        ];
    }

    /**
     * The status of one order, or a refusal.
     *
     * An unknown slug THROWS rather than defaulting. A merchant may define
     * custom statuses, and guessing at one would quietly file real orders
     * under whatever the default happened to be. The delivery is kept with
     * the reason on it, which is a question an operator can answer in a
     * minute; a wrong figure is one nobody asks.
     *
     * @param  array<string, mixed>  $order
     */
    public static function status(array $order): OrderStatus
    {
        $slug = $order['status']['slug'] ?? null;

        if (! is_string($slug) || $slug === '') {
            $id = self::externalId($order);

            throw new RuntimeException("Salla order {$id} arrived with no status slug.");
        }

        $status = self::statuses()[$slug] ?? null;

        if ($status === null) {
            $id = self::externalId($order);

            throw new RuntimeException(
                "Salla order {$id} has status '{$slug}', which this importer does not know. ".
                'If the store has defined a custom status, it must be mapped before its orders can be counted.'
            );
        }

        return $status;
    }

    /**
     * Salla's payment methods to ours.
     *
     * Unlike the statuses, an unknown method does NOT throw. A payment
     * method is a label on money that has already changed hands: refusing
     * the whole order because the wallet is unfamiliar would lose a real
     * sale over a word. It becomes `other`, and the importer keeps Salla's
     * own word in the payment's reference so nothing is lost.
     *
     * Known values are those Salla's documentation and payloads use. `mada`
     * is Saudi Arabia's domestic debit scheme and `stc_pay` its largest
     * wallet; both are cards and wallets respectively, not categories of
     * their own.
     *
     * @return array<string, PaymentMethod>
     */
    public static function paymentMethods(): array
    {
        return [
            'cod' => PaymentMethod::CashOnDelivery,
            'cash_on_delivery' => PaymentMethod::CashOnDelivery,
            'cash' => PaymentMethod::Cash,

            'credit_card' => PaymentMethod::Card,
            'mada' => PaymentMethod::Card,
            'apple_pay' => PaymentMethod::Card,
            'google_pay' => PaymentMethod::Card,

            'bank' => PaymentMethod::BankTransfer,
            'bank_transfer' => PaymentMethod::BankTransfer,

            'customer_wallet' => PaymentMethod::Wallet,
            'stc_pay' => PaymentMethod::Wallet,
            'tabby' => PaymentMethod::Wallet,
            'tamara' => PaymentMethod::Wallet,
            'paypal' => PaymentMethod::Wallet,
        ];
    }

    public static function paymentMethod(?string $salla): PaymentMethod
    {
        if ($salla === null || $salla === '') {
            return PaymentMethod::Other;
        }

        return self::paymentMethods()[strtolower($salla)] ?? PaymentMethod::Other;
    }

    /**
     * A money value out of Salla's `{amount, currency}` shape.
     *
     * Returned as a STRING, never a float: every amount in this system is
     * bcmath from end to end (ADR-015), and `(float) 0.1 + 0.2` is where
     * that rule comes from.
     *
     * A missing amount is zero only where zero is the honest reading — a
     * shipping cost that is absent is free shipping. The caller decides;
     * this does not guess, which is why `$default` has to be passed.
     *
     * @param  mixed  $node  the `{amount, currency}` pair, a bare number, or nothing
     */
    public static function money(mixed $node, ?string $default = '0'): ?string
    {
        if (is_array($node) && array_key_exists('amount', $node)) {
            $node = $node['amount'];
        }

        if (is_numeric($node)) {
            // Through string, not float: 186.00 must stay 186.00.
            return rtrim(rtrim(number_format((float) $node, 4, '.', ''), '0'), '.') ?: '0';
        }

        return $default;
    }

    /**
     * Salla's own id for the order, for messages and for `external_id`.
     *
     * @param  array<string, mixed>  $order
     */
    public static function externalId(array $order): string
    {
        $id = $order['id'] ?? null;

        return is_scalar($id) ? (string) $id : 'unknown';
    }
}
