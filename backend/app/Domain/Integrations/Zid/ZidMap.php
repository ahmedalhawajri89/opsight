<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * Turning Zid's vocabulary into this system's (ADR-037).
 *
 * The counterpart of SallaMap, and the most consequential file in the Zid
 * importer for the same reason: a status mapped one step too generously
 * turns an unfinished checkout into revenue.
 *
 * WHERE THE VALUES COME FROM. Zid's List Orders documentation, which names
 * the statuses in two places that do not agree: the filter accepts `new,
 * preparing, ready, indelivery, delivered, canceled`, while the per-status
 * counts add `initial`, `reversed`, `partially_reversed`,
 * `reverse_in_progress` and the spelling `cancelled`. Every name from both
 * lists is mapped, and an unknown one still throws.
 */
final class ZidMap
{
    /**
     * The zone Zid's timestamps are read in.
     *
     * An ASSUMPTION, and the one most worth checking on the first live run:
     * Zid's examples (`'2026-01-26 10:21:08'`) carry no offset and its
     * documentation names no zone. Zid is a Saudi platform and its merchant
     * dashboard shows Riyadh time. If the API turns out to answer in UTC,
     * every imported order is three hours early, and orders placed between
     * 21:00 and midnight land on the wrong day.
     */
    public const TIMEZONE = 'Asia/Riyadh';

    /**
     * THE LINE IS THE SAME AS SALLA'S: "has the merchant committed?". Zid
     * keeps unfinished checkouts apart as abandoned carts, so an order that
     * exists is normally a real one, and an unpaid order is
     * confirmed-and-owed rather than invisible (ADR-022).
     *
     * `initial` is the exception. It appears only in Zid's counts, never in
     * its filters, which reads as a state before the order is placed: a
     * draft, counting toward nothing.
     *
     * REVERSALS. `reversed` is goods returned and money given back — the sale
     * did not stand, so it is cancelled. `partially_reversed` and
     * `reverse_in_progress` are a sale that still stands, in whole or in
     * part; they stay fulfilled. What a partial reversal refunded is not
     * carried into the refund ledger yet, so revenue on those orders is
     * overstated by the part returned — named here rather than hidden.
     *
     * @return array<string, OrderStatus>
     */
    public static function statuses(): array
    {
        return [
            'initial' => OrderStatus::Draft,

            'new' => OrderStatus::Confirmed,
            'preparing' => OrderStatus::Confirmed,
            'ready' => OrderStatus::Confirmed,
            'indelivery' => OrderStatus::Confirmed,

            'delivered' => OrderStatus::Fulfilled,
            'partially_reversed' => OrderStatus::Fulfilled,
            'reverse_in_progress' => OrderStatus::Fulfilled,

            'canceled' => OrderStatus::Cancelled,
            'cancelled' => OrderStatus::Cancelled,
            'reversed' => OrderStatus::Cancelled,
        ];
    }

    /**
     * Throws on an unknown status rather than guessing, for the reason
     * SallaMap gives: a refused delivery is a question an operator answers in
     * a minute; a wrong figure is one nobody asks.
     *
     * @param  array<string, mixed>  $order
     */
    public static function status(array $order): OrderStatus
    {
        $node = $order['order_status'] ?? null;
        $code = is_array($node) ? ($node['code'] ?? null) : $node;
        $id = self::externalId($order);

        if (! is_string($code) || $code === '') {
            throw new RuntimeException("Zid order {$id} arrived with no status code.");
        }

        // `inDelivery` in the webhook conditions, `indelivery` in the filter.
        $status = self::statuses()[strtolower($code)] ?? null;

        if ($status === null) {
            throw new RuntimeException(
                "Zid order {$id} has status '{$code}', which this importer does not know. ".
                'If the store has defined a custom status, it must be mapped before its orders can be counted.'
            );
        }

        return $status;
    }

    /**
     * Zid's payment method codes to ours. Unknown is `other`, never a refusal:
     * a method is a label on money that has already moved.
     *
     * `zid_cop` is read as cash on PICKUP — the counterpart of `zid_cod` — so
     * cash rather than cash on delivery.
     *
     * @return array<string, PaymentMethod>
     */
    public static function paymentMethods(): array
    {
        return [
            'zid_cod' => PaymentMethod::CashOnDelivery,
            'cod' => PaymentMethod::CashOnDelivery,
            'zid_cop' => PaymentMethod::Cash,

            'zid_credit_card' => PaymentMethod::Card,
            'credit_card' => PaymentMethod::Card,
            'mada' => PaymentMethod::Card,
            'apple_pay' => PaymentMethod::Card,

            'zid_bank_transfer' => PaymentMethod::BankTransfer,
            'bank_transfer' => PaymentMethod::BankTransfer,

            'stc_pay' => PaymentMethod::Wallet,
            'tabby' => PaymentMethod::Wallet,
            'tamara' => PaymentMethod::Wallet,
        ];
    }

    public static function paymentMethod(?string $code): PaymentMethod
    {
        if ($code === null || $code === '') {
            return PaymentMethod::Other;
        }

        return self::paymentMethods()[strtolower($code)] ?? PaymentMethod::Other;
    }

    /** `+03:00` style offset of TIMEZONE, for Zid's date filters. */
    public static function utcOffset(): string
    {
        return str_replace(':', '', CarbonImmutable::now(self::TIMEZONE)->format('P'));
    }

    /** @param  array<string, mixed>  $order */
    public static function externalId(array $order): string
    {
        $id = $order['id'] ?? null;

        return is_scalar($id) ? (string) $id : 'unknown';
    }

    /**
     * A product name that may be a string or a `{ar, en}` pair — the order
     * payload uses the first, the catalogue the second.
     */
    public static function name(mixed $value): ?string
    {
        if (is_string($value) && trim($value) !== '') {
            return trim($value);
        }

        if (is_array($value)) {
            foreach (['en', 'ar'] as $locale) {
                if (is_string($value[$locale] ?? null) && trim($value[$locale]) !== '') {
                    return trim($value[$locale]);
                }
            }
        }

        return null;
    }
}
