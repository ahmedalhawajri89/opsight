<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use App\Domain\Integrations\Import\Amount;
use App\Domain\Integrations\Import\ImportedProduct;
use App\Domain\Integrations\Import\RecordImportedProduct;
use App\Models\Product;
use App\Support\Money;

/**
 * One Zid catalogue entry, as a Baydar product (ADR-030, ADR-037).
 *
 * Zid's product carries `cost` — "Internal cost of the product. Returns null
 * when no cost is configured." — so a Zid store's margin is known from the
 * first backfill, the reason the catalogue is walked before the orders.
 *
 * VARIANTS. A product with options is a `parent` whose `variants` are what is
 * actually sold, each with its own id and SKU, and those are what an order's
 * lines name. So a parent is not imported itself; each variant is, carrying
 * the parent's name where it has none of its own. A `standalone` product is
 * imported as it is.
 */
final class ImportZidProduct
{
    public const SOURCE = ImportZidOrder::SOURCE;

    public function __construct(private readonly RecordImportedProduct $record) {}

    /**
     * Every sellable product in one catalogue entry.
     *
     * @param  array<string, mixed>  $payload
     * @return list<Product>
     */
    public function __invoke(array $payload): array
    {
        $products = [];

        foreach ($this->map($payload) as $imported) {
            $product = ($this->record)($imported);

            if ($product !== null) {
                $products[] = $product;
            }
        }

        return $products;
    }

    /**
     * @param  array<string, mixed>  $payload
     * @return list<ImportedProduct>
     */
    public function map(array $payload): array
    {
        $variants = is_array($payload['variants'] ?? null) ? array_values(array_filter($payload['variants'], 'is_array')) : [];

        if (($payload['structure'] ?? null) === 'parent' && $variants !== []) {
            $parentName = ZidMap::name($payload['name'] ?? null);

            return array_map(
                fn (array $variant): ImportedProduct => $this->one($variant, $parentName, (bool) ($payload['is_published'] ?? true)),
                $variants,
            );
        }

        return [$this->one($payload, null, true)];
    }

    /** @param  array<string, mixed>  $node */
    private function one(array $node, ?string $parentName, bool $parentPublished): ImportedProduct
    {
        $sku = is_scalar($node['sku'] ?? null) && (string) $node['sku'] !== '' ? mb_substr((string) $node['sku'], 0, 64) : null;
        $cost = Amount::of($node['cost'] ?? null, null);

        return new ImportedProduct(
            source: self::SOURCE,
            externalId: is_scalar($node['id'] ?? null) && (string) $node['id'] !== '' ? (string) $node['id'] : null,
            sku: $sku,
            name: ZidMap::name($node['name'] ?? null) ?? $parentName ?? $sku ?? 'Zid product',
            // Rounded once, here, to the catalogue's four places.
            price: Money::round(Amount::of($node['price'] ?? null, '0') ?? '0', 4),
            // Zero is "not filled in", as with Salla: a margin of 100% on a
            // guessed cost is worse than an unknown margin.
            cost: $cost !== null && bccomp($cost, '0', 4) > 0 ? Money::round($cost, 4) : null,
            isActive: $parentPublished && (bool) ($node['is_published'] ?? true),
        );
    }
}
