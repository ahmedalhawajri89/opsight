<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

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
 * One Salla order, as a Baydar order (ADR-029, ADR-037).
 *
 * This class now only TRANSLATES. It reads Salla's payload — its money
 * shapes, its split phone number, its status slugs through SallaMap — into an
 * ImportedOrder, and hands that to RecordImportedOrder, which holds the rules
 * every store shares: idempotency on `(source, external_id)`, not moving
 * stock, not repopulating an erased customer (ADR-037).
 *
 * The totals are Salla's own, which is what makes reconciliation meaningful:
 * if they were recomputed, `opsight:salla:reconcile` would be comparing our
 * arithmetic against itself.
 */
final class ImportSallaOrder
{
    public const SOURCE = 'salla';

    public function __construct(private readonly RecordImportedOrder $record) {}

    /**
     * @param  array<string, mixed>  $payload  the order, as Salla sends it
     */
    public function __invoke(array $payload): Order
    {
        return ($this->record)($this->map($payload));
    }

    /**
     * Salla's payload in Baydar's terms. Throws, before anything is written,
     * on a status this importer does not know (SallaMap::status).
     *
     * @param  array<string, mixed>  $payload
     */
    public function map(array $payload): ImportedOrder
    {
        $externalId = SallaMap::externalId($payload);
        $status = SallaMap::status($payload);
        $amounts = is_array($payload['amounts'] ?? null) ? $payload['amounts'] : [];

        $discount = '0';

        foreach ((array) ($amounts['discounts'] ?? []) as $line) {
            if (is_array($line) && isset($line['discount']) && is_numeric($line['discount'])) {
                $discount = bcadd($discount, (string) $line['discount'], Money::scale());
            }
        }

        return new ImportedOrder(
            source: self::SOURCE,
            externalId: $externalId,
            status: $status,
            placedAt: $this->placedAt($payload),
            customer: $this->customer($payload['customer'] ?? null),
            lines: $this->lines($payload['items'] ?? []),
            subtotal: (string) SallaMap::money($amounts['sub_total'] ?? null, '0'),
            discount: $discount,
            tax: (string) SallaMap::money($amounts['tax']['amount'] ?? null, '0'),
            shipping: (string) SallaMap::money($amounts['shipping_cost'] ?? null, '0'),
            total: (string) SallaMap::money($amounts['total'] ?? null, '0'),
            payments: $this->payments($payload),
            cancellationReason: 'Cancelled in Salla',
            context: ['reference_id' => $payload['reference_id'] ?? null],
        );
    }

    private function customer(mixed $node): ?ImportedCustomer
    {
        if (! is_array($node)) {
            return null;
        }

        $externalId = isset($node['id']) && is_scalar($node['id']) ? (string) $node['id'] : null;

        if ($externalId === null) {
            return null;
        }

        $name = trim(((string) ($node['first_name'] ?? '')).' '.((string) ($node['last_name'] ?? '')));

        /*
         * The phone arrives split: `mobile_code` is "+966" and `mobile` is
         * the rest, often as an INTEGER, which drops any leading zero. Joined
         * and normalised to E.164 by the same class the forms use (ADR-021),
         * and left null rather than stored malformed if it cannot be placed.
         */
        $phone = null;
        $mobile = $node['mobile'] ?? null;

        if (is_scalar($mobile) && (string) $mobile !== '') {
            $phone = PhoneNumber::normalize(
                ((string) ($node['mobile_code'] ?? '')).(string) $mobile,
                is_string($node['country_code'] ?? null) ? $node['country_code'] : null,
            );
        }

        return new ImportedCustomer(
            externalId: $externalId,
            name: $name !== '' ? $name : 'Salla customer '.$externalId,
            email: is_string($node['email'] ?? null) ? $node['email'] : null,
            phone: $phone,
            city: is_string($node['city'] ?? null) ? $node['city'] : null,
            country: is_string($node['country_code'] ?? null) ? strtoupper($node['country_code']) : null,
        );
    }

    /** @return list<ImportedLine>|null */
    private function lines(mixed $items): ?array
    {
        if (! is_array($items)) {
            return null;
        }

        $lines = [];

        foreach ($items as $item) {
            if (! is_array($item)) {
                continue;
            }

            $node = is_array($item['product'] ?? null) ? $item['product'] : [];
            $productSku = $this->sku($item, $node);
            $amounts = is_array($item['amounts'] ?? null) ? $item['amounts'] : [];

            /*
             * `price_without_tax` is the line before tax; `total` is after
             * it. The unit price is taken from the pre-tax figure so a line
             * reads the way the catalogue does, and VAT stays on the order.
             */
            $lineTotal = SallaMap::money($amounts['price_without_tax'] ?? null, null)
                ?? SallaMap::money($amounts['total'] ?? null, '0');

            $lines[] = new ImportedLine(
                productExternalId: isset($node['id']) && is_scalar($node['id']) ? (string) $node['id'] : null,
                productSku: $productSku,
                productName: (string) ($item['name'] ?? $node['name'] ?? $productSku),
                productPrice: (string) SallaMap::money($node['price'] ?? null, '0'),
                name: isset($item['name']) ? (string) $item['name'] : null,
                sku: isset($item['sku']) ? (string) $item['sku'] : null,
                fallbackName: 'Salla item',
                quantity: max(1, (int) ($item['quantity'] ?? 1)),
                lineTotal: (string) $lineTotal,
                discount: (string) SallaMap::money($amounts['total_discount'] ?? null, '0'),
            );
        }

        return $lines;
    }

    /**
     * @param  array<string, mixed>  $item
     * @param  array<string, mixed>  $node
     */
    private function sku(array $item, array $node): ?string
    {
        foreach ([$item['sku'] ?? null, $node['sku'] ?? null] as $candidate) {
            if (is_scalar($candidate) && (string) $candidate !== '') {
                return mb_substr((string) $candidate, 0, 64);
            }
        }

        return null;
    }

    /** @param array<string, mixed> $payload */
    private function placedAt(array $payload): Carbon
    {
        $date = $payload['date']['date'] ?? null;
        $zone = $payload['date']['timezone'] ?? null;

        if (is_string($date) && $date !== '') {
            return Carbon::parse($date, is_string($zone) ? $zone : 'UTC')->utc();
        }

        return Carbon::now();
    }

    /**
     * Salla sends `payment_methods` as a list — an order can be part wallet,
     * part card — so each entry becomes its own payment row, which is what
     * the ledger is shaped for (ADR-022).
     *
     * @param  array<string, mixed>  $payload
     * @return list<ImportedPayment>
     */
    private function payments(array $payload): array
    {
        $entries = is_array($payload['payment_methods'] ?? null) ? $payload['payment_methods'] : [];

        if ($entries === []) {
            $method = SallaMap::paymentMethod(is_string($payload['payment_method'] ?? null) ? $payload['payment_method'] : null);
            $entries = [['amount' => $payload['amounts']['total']['amount'] ?? 0, 'payment_method' => $method->value]];
        }

        $payments = [];

        foreach ($entries as $entry) {
            if (! is_array($entry)) {
                continue;
            }

            $raw = is_string($entry['payment_method'] ?? null) ? $entry['payment_method'] : null;

            $payments[] = new ImportedPayment(
                amount: (string) SallaMap::money($entry['amount'] ?? null, '0'),
                method: SallaMap::paymentMethod($raw),
                // Salla's own word for the method, kept so nothing is lost
                // when it maps to `other`.
                reference: $raw,
            );
        }

        return $payments;
    }
}
