<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Import;

use App\Domain\Audit\AuditRecorder;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

/**
 * Writes a catalogue entry from any connected store (ADR-030, ADR-037).
 *
 * Idempotent like the order writer: matched on `(source, external_id)` first,
 * then on SKU, so a catalogue entered here by hand before the store was
 * connected gains the store's id rather than a duplicate.
 */
final class RecordImportedProduct
{
    public function __construct(private readonly AuditRecorder $recorder) {}

    public function __invoke(ImportedProduct $imported): ?Product
    {
        if ($imported->externalId === null && $imported->sku === null) {
            // Nothing to identify it by, now or on the next run.
            return null;
        }

        return DB::transaction(function () use ($imported): Product {
            $product = $this->find($imported);
            $isNew = $product === null;

            if ($isNew) {
                $product = new Product;
            }

            $attributes = [
                'source' => $imported->source,
                'external_id' => $imported->externalId,
                'name' => mb_substr($imported->name, 0, 180),
                'price' => $imported->price,
                'is_active' => $imported->isActive,
            ];

            if ($imported->sku !== null) {
                $attributes['sku'] = $imported->sku;
            }

            /*
             * The cost is written ONLY when the store has one. Overwriting a
             * cost the owner typed here with "not filled in" would silently
             * wipe the margin on products they had already priced — the exact
             * harm the catalogue pass exists to undo.
             */
            if ($imported->cost !== null) {
                $attributes['cost'] = $imported->cost;
            }

            $product->forceFill($attributes)->save();

            $this->recorder->record(
                action: $isNew ? 'product.imported' : 'product.reimported',
                subject: $product,
                context: [
                    'source' => $imported->source,
                    'external_id' => $imported->externalId,
                    // Whether this run could give it a margin at all.
                    'cost_known' => $imported->cost !== null,
                ],
            );

            return $product->refresh();
        });
    }

    private function find(ImportedProduct $imported): ?Product
    {
        if ($imported->externalId !== null) {
            $found = Product::query()
                ->where('source', $imported->source)
                ->where('external_id', $imported->externalId)
                ->first();

            if ($found !== null) {
                return $found;
            }
        }

        return $imported->sku !== null
            ? Product::query()->where('sku', $imported->sku)->first()
            : null;
    }
}
