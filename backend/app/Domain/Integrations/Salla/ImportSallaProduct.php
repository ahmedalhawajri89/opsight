<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Domain\Integrations\Import\ImportedProduct;
use App\Domain\Integrations\Import\RecordImportedProduct;
use App\Models\Product;
use App\Support\Money;

/**
 * One Salla product, as a Baydar product (ADR-030, ADR-037).
 *
 * THIS EXISTS FOR ONE FIELD: `cost_price`. Salla's order payload carries no
 * cost, so a product first seen through an order arrives costing zero and
 * every sale of it has no margin. Salla does hold the cost, as `cost_price`
 * on the product — a plain number, not the `{amount, currency}` shape its
 * prices use — so the catalogue is walked before the orders.
 *
 * Translation only; RecordImportedProduct does the writing and the matching
 * on `(source, external_id)`, then SKU.
 */
final class ImportSallaProduct
{
    public const SOURCE = ImportSallaOrder::SOURCE;

    public function __construct(private readonly RecordImportedProduct $record) {}

    /**
     * @param  array<string, mixed>  $payload  the product, as Salla sends it
     */
    public function __invoke(array $payload): ?Product
    {
        return ($this->record)($this->map($payload));
    }

    /** @param  array<string, mixed>  $payload */
    public function map(array $payload): ImportedProduct
    {
        $sku = $this->sku($payload);

        return new ImportedProduct(
            source: self::SOURCE,
            externalId: isset($payload['id']) && is_scalar($payload['id']) ? (string) $payload['id'] : null,
            sku: $sku,
            name: (string) ($payload['name'] ?? $sku ?? 'Salla product'),
            price: Money::round((string) (SallaMap::money($payload['price'] ?? null, '0') ?? '0'), 4),
            cost: $this->cost($payload),
            isActive: ($payload['status'] ?? 'sale') !== 'hidden',
        );
    }

    /** @param array<string, mixed> $payload */
    private function sku(array $payload): ?string
    {
        $sku = $payload['sku'] ?? null;

        return is_scalar($sku) && (string) $sku !== '' ? mb_substr((string) $sku, 0, 64) : null;
    }

    /**
     * Salla's `cost_price`, or null when it has none worth writing.
     *
     * Zero is treated as absent. Salla's own field is optional and defaults
     * to nothing, so a zero is overwhelmingly "not filled in" rather than "a
     * product that costs nothing", and the cost of guessing wrong the other
     * way is a margin of 100% on a figure an owner will act on.
     *
     * @param  array<string, mixed>  $payload
     */
    private function cost(array $payload): ?string
    {
        $cost = SallaMap::money($payload['cost_price'] ?? null, null);

        if ($cost === null || bccomp($cost, '0', 4) <= 0) {
            return null;
        }

        return Money::round($cost, 4);
    }
}
