<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use App\Domain\Integrations\Import\Amount;
use App\Domain\Integrations\Import\ImportedCustomer;
use App\Domain\Integrations\Import\ImportedLine;
use App\Domain\Integrations\Import\ImportedOrder;
use App\Domain\Integrations\Import\ImportedPayment;
use App\Domain\Integrations\Import\RecordImportedOrder;
use App\Models\Order;
use App\Support\Money;
use App\Support\PhoneNumber;
use Illuminate\Support\Carbon;

/**
 * One Zid order, as a Baydar order (ADR-037).
 *
 * Translation only. Writing — idempotency, stock left alone, erased
 * customers kept erased — is RecordImportedOrder's, shared with Salla.
 *
 * WHERE THE MONEY IS. Zid's order carries its breakdown as
 * `payment.invoice`, a list of `{code, value}` lines: `sub_totals_before_vat`,
 * `shipping`, `vat`, `total`. Those are the store's own figures and are
 * written as they arrived. An order without the list falls back to
 * `order_total`, with the subtotal summed from its lines.
 *
 * WHAT WAS PAID. Unlike Salla, Zid states a `payment_status`, so a payment is
 * recorded only for an order Zid calls `paid`. A cash-on-delivery order not
 * yet delivered is then owed rather than settled, which is what the
 * receivables figure exists to show (ADR-022).
 */
final class ImportZidOrder
{
    public const SOURCE = 'zid';

    public function __construct(private readonly RecordImportedOrder $record) {}

    /** @param  array<string, mixed>  $payload  the order, as Zid sends it */
    public function __invoke(array $payload): Order
    {
        return ($this->record)($this->map($payload));
    }

    /** @param  array<string, mixed>  $payload */
    public function map(array $payload): ImportedOrder
    {
        $status = ZidMap::status($payload);
        $lines = $this->lines($payload['products'] ?? null);
        $invoice = $this->invoice($payload);

        $total = $invoice['total'] ?? Amount::of($payload['order_total'] ?? null, '0') ?? '0';
        $subtotal = $invoice['sub_totals_before_vat'] ?? $this->sum($lines);

        return new ImportedOrder(
            source: self::SOURCE,
            externalId: ZidMap::externalId($payload),
            status: $status,
            placedAt: $this->placedAt($payload),
            customer: $this->customer($payload['customer'] ?? null),
            lines: $lines,
            subtotal: $subtotal,
            discount: $this->discount($payload),
            tax: $invoice['vat'] ?? '0',
            shipping: $invoice['shipping'] ?? '0',
            total: $total,
            payments: $this->payments($payload, $total),
            cancellationReason: 'Cancelled in Zid',
            context: ['code' => $payload['code'] ?? null],
        );
    }

    private function customer(mixed $node): ?ImportedCustomer
    {
        if (! is_array($node) || ! isset($node['id']) || ! is_scalar($node['id'])) {
            return null;
        }

        $externalId = (string) $node['id'];
        $name = is_string($node['name'] ?? null) ? trim($node['name']) : '';

        /*
         * `mobile` arrives as digits with the country code and no plus —
         * `'966123456789'`. Given its plus back before normalising, or the
         * number is read as a local one and placed in the wrong country.
         */
        $phone = null;
        $mobile = $node['mobile'] ?? null;

        if (is_scalar($mobile) && (string) $mobile !== '') {
            $digits = (string) $mobile;
            $phone = PhoneNumber::normalize(str_starts_with($digits, '+') ? $digits : '+'.$digits, 'SA');
        }

        return new ImportedCustomer(
            externalId: $externalId,
            name: $name !== '' ? $name : 'Zid customer '.$externalId,
            email: is_string($node['email'] ?? null) && $node['email'] !== '' ? $node['email'] : null,
            phone: $phone,
        );
    }

    /** @return list<ImportedLine>|null */
    private function lines(mixed $products): ?array
    {
        if (! is_array($products)) {
            // Absent, not empty: a payload type without lines leaves the
            // stored ones alone.
            return null;
        }

        $lines = [];

        foreach ($products as $item) {
            if (! is_array($item)) {
                continue;
            }

            $quantity = max(1, (int) ($item['quantity'] ?? 1));
            $sku = is_scalar($item['sku'] ?? null) && (string) $item['sku'] !== '' ? mb_substr((string) $item['sku'], 0, 64) : null;
            $name = ZidMap::name($item['name'] ?? null);

            /*
             * `net_price` is the unit price before VAT; `price` and `total`
             * include it. The line is written before tax so it reads the way
             * the catalogue does, and VAT stays on the order.
             */
            $unitNet = Amount::of($item['net_price'] ?? null, null);
            $lineTotal = $unitNet !== null
                ? bcmul($unitNet, (string) $quantity, 4)
                : (Amount::of($item['total'] ?? null, '0') ?? '0');

            $lines[] = new ImportedLine(
                productExternalId: is_scalar($item['id'] ?? null) && (string) $item['id'] !== '' ? (string) $item['id'] : null,
                productSku: $sku,
                productName: $name ?? $sku ?? 'Zid item',
                productPrice: Money::round($unitNet ?? '0', 4),
                name: $name,
                sku: $sku,
                fallbackName: 'Zid item',
                quantity: $quantity,
                lineTotal: $lineTotal,
                discount: Amount::of($item['discounts']['coupon']['amount'] ?? null, '0') ?? '0',
            );
        }

        return $lines;
    }

    /**
     * `payment.invoice` as code => amount.
     *
     * @param  array<string, mixed>  $payload
     * @return array<string, string>
     */
    private function invoice(array $payload): array
    {
        $lines = $payload['payment']['invoice'] ?? null;
        $out = [];

        if (! is_array($lines)) {
            return $out;
        }

        foreach ($lines as $line) {
            if (! is_array($line) || ! is_string($line['code'] ?? null)) {
                continue;
            }

            $amount = Amount::of($line['value'] ?? null, null);

            if ($amount !== null) {
                $out[$line['code']] = $amount;
            }
        }

        return $out;
    }

    /**
     * What the order was discounted by, as a positive figure.
     *
     * Zid's documentation describes invoice lines "such as subtotal, tax,
     * discount" without printing a discount line's code, so any invoice code
     * naming a discount or coupon is counted, and the coupon's own figure is
     * the fallback.
     *
     * @param  array<string, mixed>  $payload
     */
    private function discount(array $payload): string
    {
        $total = '0';

        foreach ($this->invoice($payload) as $code => $amount) {
            if (str_contains($code, 'discount') || str_contains($code, 'coupon')) {
                $total = bcadd($total, ltrim($amount, '-'), 4);
            }
        }

        if (bccomp($total, '0', 4) === 0) {
            $coupon = Amount::of($payload['coupon']['discount'] ?? null, null);

            if ($coupon !== null) {
                $total = ltrim($coupon, '-');
            }
        }

        return $total;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return list<ImportedPayment>
     */
    private function payments(array $payload, string $total): array
    {
        if (($payload['payment_status'] ?? null) !== 'paid') {
            return [];
        }

        $method = $payload['payment']['method'] ?? null;
        $code = is_array($method) ? ($method['code'] ?? null) : $method;
        $code = is_string($code) ? $code : null;

        $splits = $payload['payment']['split_payments'] ?? null;

        if (is_array($splits) && $splits !== []) {
            $payments = [];

            foreach ($splits as $split) {
                if (! is_array($split)) {
                    continue;
                }

                $raw = is_string($split['code'] ?? null) ? $split['code'] : $code;

                $payments[] = new ImportedPayment(
                    amount: Amount::of($split['amount'] ?? null, '0') ?? '0',
                    method: ZidMap::paymentMethod($raw),
                    reference: $raw,
                );
            }

            return $payments;
        }

        return [new ImportedPayment(
            amount: $total,
            method: ZidMap::paymentMethod($code),
            reference: $code,
        )];
    }

    /** @param  list<ImportedLine>|null  $lines */
    private function sum(?array $lines): string
    {
        $sum = '0';

        foreach ($lines ?? [] as $line) {
            $sum = bcadd($sum, $line->lineTotal, 4);
        }

        return $sum;
    }

    /** @param  array<string, mixed>  $payload */
    private function placedAt(array $payload): Carbon
    {
        $date = $payload['created_at'] ?? null;

        if (is_string($date) && $date !== '') {
            return Carbon::parse($date, ZidMap::TIMEZONE)->utc();
        }

        return Carbon::now();
    }
}
