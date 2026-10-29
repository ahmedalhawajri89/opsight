<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Domain\Audit\AuditRecorder;
use App\Models\Product;
use App\Support\Money;
use Illuminate\Support\Facades\DB;

/**
 * One Salla product, as an Opsight product (ADR-030).
 *
 * THIS EXISTS FOR ONE FIELD: `cost_price`.
 *
 * The order importer can build everything else from an order's own payload —
 * the line carries its product's id, sku, name and price. What it cannot
 * carry is what the product COST, because Salla's order payload does not
 * include it. So every product created from an order arrives with a cost of
 * zero, and a business whose orders all came from Salla sees revenue with no
 * margin: half of what a product called "business intelligence" is for.
 *
 * Salla does hold it, as `cost_price` on the product itself — a plain number,
 * not the `{amount, currency}` shape its prices use. Fetching it needs the
 * Products API rather than the webhook, which is why this is a separate pass
 * over the catalogue rather than something the order importer does inline.
 *
 * Idempotent like the order importer, and for the same reasons: matched on
 * `(source, external_id)` first, then on SKU, so a catalogue entered here by
 * hand before the store was connected gains its Salla id rather than a
 * duplicate.
 */
final class ImportSallaProduct
{
    public const SOURCE = ImportSallaOrder::SOURCE;

    public function __construct(private readonly AuditRecorder $recorder) {}

    /**
     * @param  array<string, mixed>  $payload  the product, as Salla sends it
     */
    public function __invoke(array $payload): ?Product
    {
        $externalId = isset($payload['id']) && is_scalar($payload['id']) ? (string) $payload['id'] : null;
        $sku = $this->sku($payload);

        if ($externalId === null && $sku === null) {
            // Nothing to identify it by, now or on the next run.
            return null;
        }

        return DB::transaction(function () use ($payload, $externalId, $sku): Product {
            $product = $this->find($externalId, $sku);
            $isNew = $product === null;

            if ($isNew) {
                $product = new Product;
            }

            $attributes = [
                'source' => self::SOURCE,
                'external_id' => $externalId,
                'name' => mb_substr((string) ($payload['name'] ?? $sku ?? 'Salla product'), 0, 180),
                'price' => Money::round((string) (SallaMap::money($payload['price'] ?? null, '0') ?? '0'), 4),
                'is_active' => ($payload['status'] ?? 'sale') !== 'hidden',
            ];

            if ($sku !== null) {
                $attributes['sku'] = $sku;
            }

            /*
             * The cost is written ONLY when Salla has one.
             *
             * A merchant who has not filled in cost_price sends null or zero,
             * and overwriting a cost the owner typed here with that would
             * silently wipe the margin on products they had already priced —
             * the exact harm this class exists to undo.
             */
            $cost = $this->cost($payload);

            if ($cost !== null) {
                $attributes['cost'] = $cost;
            }

            $product->forceFill($attributes)->save();

            $this->recorder->record(
                action: $isNew ? 'product.imported' : 'product.reimported',
                subject: $product,
                context: [
                    'source' => self::SOURCE,
                    'external_id' => $externalId,
                    // Whether this run could give it a margin at all.
                    'cost_known' => $cost !== null,
                ],
            );

            return $product->refresh();
        });
    }

    private function find(?string $externalId, ?string $sku): ?Product
    {
        if ($externalId !== null) {
            $found = Product::query()
                ->where('source', self::SOURCE)
                ->where('external_id', $externalId)
                ->first();

            if ($found !== null) {
                return $found;
            }
        }

        // A catalogue entered here by hand before the store was connected has
        // the same SKUs. It gains its Salla id rather than a second copy.
        return $sku !== null ? Product::query()->where('sku', $sku)->first() : null;
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
     * A plain number rather than the `{amount, currency}` shape used for
     * prices — and often a numeric string, which is why it goes through the
     * same money reader as everything else rather than a cast.
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
