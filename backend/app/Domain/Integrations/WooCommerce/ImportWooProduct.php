<?php

declare(strict_types=1);

namespace App\Domain\Integrations\WooCommerce;

use App\Domain\Integrations\Import\Amount;
use App\Domain\Integrations\Import\ImportedProduct;
use App\Domain\Integrations\Import\RecordImportedProduct;
use App\Support\Money;

/**
 * One WooCommerce product into the catalogue. WooCommerce has no cost field
 * of its own, so cost is left unknown rather than guessed: the owner fills it
 * in, and until then the product's margin says "unknown", not 100%.
 */
final class ImportWooProduct
{
    public const SOURCE = ImportWooOrder::SOURCE;

    public function __construct(private readonly RecordImportedProduct $record) {}

    /** @param  array<string, mixed>  $payload */
    public function __invoke(array $payload): void
    {
        $sku = is_string($payload['sku'] ?? null) && trim($payload['sku']) !== '' ? trim($payload['sku']) : null;
        $name = is_string($payload['name'] ?? null) && trim($payload['name']) !== '' ? trim($payload['name']) : null;

        ($this->record)(new ImportedProduct(
            source: self::SOURCE,
            externalId: isset($payload['id']) ? (string) $payload['id'] : null,
            sku: $sku,
            name: $name ?? $sku ?? 'WooCommerce product',
            price: Money::round(Amount::of($payload['price'] ?? $payload['regular_price'] ?? null, '0') ?? '0', 4),
            cost: null,
            isActive: ($payload['status'] ?? 'publish') === 'publish',
        ));
    }
}
