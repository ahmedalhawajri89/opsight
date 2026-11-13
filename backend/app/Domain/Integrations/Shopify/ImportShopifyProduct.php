<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Shopify;

use App\Domain\Integrations\Import\Amount;
use App\Domain\Integrations\Import\ImportedProduct;
use App\Domain\Integrations\Import\RecordImportedProduct;
use App\Support\Money;

/**
 * One Shopify variant into the catalogue: in Shopify the thing sold, with
 * its own SKU and price, is the variant. A product with one "Default Title"
 * variant is named after the product alone.
 */
final class ImportShopifyProduct
{
    public const SOURCE = ImportShopifyOrder::SOURCE;

    public function __construct(private readonly RecordImportedProduct $record) {}

    /** @param  array<string, mixed>  $payload */
    public function __invoke(array $payload): void
    {
        $product = is_array($payload['product'] ?? null) ? $payload['product'] : [];
        $productTitle = trim((string) ($product['title'] ?? ''));
        $variantTitle = trim((string) ($payload['title'] ?? ''));
        $name = $variantTitle === '' || $variantTitle === 'Default Title'
            ? $productTitle
            : trim($productTitle.' - '.$variantTitle, ' -');
        $sku = is_string($payload['sku'] ?? null) && trim($payload['sku']) !== '' ? trim($payload['sku']) : null;

        ($this->record)(new ImportedProduct(
            source: self::SOURCE,
            externalId: isset($payload['legacyResourceId']) ? (string) $payload['legacyResourceId'] : null,
            sku: $sku,
            name: $name !== '' ? $name : ($sku ?? 'Shopify product'),
            price: Money::round(Amount::of($payload['price'] ?? null, '0') ?? '0', 4),
            cost: null,
            isActive: ($product['status'] ?? 'ACTIVE') === 'ACTIVE',
        ));
    }
}
