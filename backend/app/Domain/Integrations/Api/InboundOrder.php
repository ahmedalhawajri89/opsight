<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Api;

use App\Domain\Integrations\Import\ImportedCustomer;
use App\Domain\Integrations\Import\ImportedLine;
use App\Domain\Integrations\Import\ImportedOrder;
use App\Domain\Integrations\Import\ImportedPayment;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;

/**
 * An order sent in through the universal connection, read into the same
 * ImportedOrder that Salla, Zid and file imports produce, so it is recorded
 * by the one recorder (RecordImportedOrder) with the same rules: idempotent
 * on the sender's id, stock moved, payments booked, audited.
 *
 * THE SHAPE IS DELIBERATELY SMALL. A sender needs an id, a date, and lines
 * with a name, a quantity and a price. Everything else has a sensible
 * default, so a Zapier or Make step can be filled in by someone who is not
 * a developer. Money is sent as numbers or numeric strings; it is read with
 * bcmath, never as floats.
 */
final class InboundOrder
{
    public const SOURCE = 'api';

    /** Statuses a sender may state; a draft is not trade and is not accepted. */
    public const STATUSES = ['confirmed', 'fulfilled', 'cancelled', 'refunded'];

    /** @return array<string, mixed> */
    public static function rules(): array
    {
        $money = ['numeric', 'min:0', 'max:999999999999'];

        return [
            'id' => ['required', 'string', 'max:190'],
            'placed_at' => ['required', 'date'],
            'status' => ['sometimes', Rule::in(self::STATUSES)],
            'customer' => ['sometimes', 'nullable', 'array'],
            'customer.id' => ['sometimes', 'nullable', 'string', 'max:190'],
            'customer.name' => ['required_with:customer', 'string', 'max:190'],
            'customer.email' => ['sometimes', 'nullable', 'email', 'max:190'],
            'customer.phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'customer.city' => ['sometimes', 'nullable', 'string', 'max:120'],
            'customer.country' => ['sometimes', 'nullable', 'string', 'size:2'],
            'lines' => ['required', 'array', 'min:1', 'max:500'],
            'lines.*.sku' => ['sometimes', 'nullable', 'string', 'max:120'],
            'lines.*.name' => ['required', 'string', 'max:190'],
            'lines.*.quantity' => ['required', 'integer', 'min:1', 'max:1000000'],
            'lines.*.unit_price' => ['required', ...$money],
            'discount' => ['sometimes', ...$money],
            'shipping' => ['sometimes', ...$money],
            'tax' => ['sometimes', ...$money],
            'paid' => ['sometimes', ...$money],
            'payment_method' => ['sometimes', Rule::enum(PaymentMethod::class)],
        ];
    }

    /** @param  array<string, mixed>  $data  already validated against rules() */
    public static function toImported(array $data, string $keyName): ImportedOrder
    {
        $lines = [];
        $subtotal = '0';

        foreach ($data['lines'] as $line) {
            $quantity = (int) $line['quantity'];
            $unit = self::money($line['unit_price']);
            $lineTotal = bcmul($unit, (string) $quantity, 4);
            $subtotal = bcadd($subtotal, $lineTotal, 4);
            $sku = isset($line['sku']) && trim((string) $line['sku']) !== '' ? trim((string) $line['sku']) : null;

            $lines[] = new ImportedLine(
                productExternalId: null,
                productSku: $sku,
                productName: (string) $line['name'],
                productPrice: $unit,
                name: (string) $line['name'],
                sku: $sku,
                fallbackName: 'Item',
                quantity: $quantity,
                lineTotal: $lineTotal,
                discount: '0',
            );
        }

        $discount = self::money($data['discount'] ?? 0);
        $shipping = self::money($data['shipping'] ?? 0);
        $tax = self::money($data['tax'] ?? 0);
        $total = bcsub(bcadd(bcadd($subtotal, $shipping, 4), $tax, 4), $discount, 4);
        $status = OrderStatus::from($data['status'] ?? 'confirmed');

        $customer = null;

        if (! empty($data['customer']['name'])) {
            $c = $data['customer'];
            $customer = new ImportedCustomer(
                // The sender's own id when it has one, the email otherwise, so
                // the same buyer is matched across orders.
                externalId: (string) ($c['id'] ?? $c['email'] ?? $c['phone'] ?? $c['name']),
                name: (string) $c['name'],
                email: $c['email'] ?? null,
                phone: $c['phone'] ?? null,
                city: $c['city'] ?? null,
                country: isset($c['country']) ? strtoupper((string) $c['country']) : null,
            );
        }

        $payments = [];
        $paid = isset($data['paid']) ? self::money($data['paid']) : null;

        if ($paid !== null && bccomp($paid, '0', 4) > 0) {
            $payments[] = new ImportedPayment(
                amount: bccomp($paid, $total, 4) > 0 ? $total : $paid,
                method: PaymentMethod::from($data['payment_method'] ?? PaymentMethod::Other->value),
            );
        }

        return new ImportedOrder(
            source: self::SOURCE,
            externalId: (string) $data['id'],
            status: $status,
            placedAt: Carbon::parse((string) $data['placed_at']),
            customer: $customer,
            lines: $lines,
            subtotal: $subtotal,
            discount: $discount,
            tax: $tax,
            shipping: $shipping,
            total: $total,
            payments: $payments,
            cancellationReason: 'Cancelled in '.$keyName,
            context: ['via' => 'api', 'key' => $keyName],
        );
    }

    private static function money(mixed $value): string
    {
        return bcadd(is_float($value) ? number_format($value, 4, '.', '') : (string) $value, '0', 4);
    }
}
