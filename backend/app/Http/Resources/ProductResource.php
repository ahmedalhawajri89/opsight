<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Authorization\Ability;
use App\Models\Product;
use App\Support\Localization\LocalizedName;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Product
 *
 * THE ONLY place products.cost is serialised.
 *
 * One resource class per model means a newly added endpoint returning this
 * model inherits the redaction automatically — it cannot forget
 * (SECURITY.md §4).
 */
class ProductResource extends JsonResource
{
    /**
     * mergeWhen inserts an int-keyed MergeValue that Laravel flattens after
     * this returns, so the array is genuinely int|string keyed here.
     *
     * @return array<int|string, mixed>
     */
    public function toArray(Request $request): array
    {
        $user = $request->user();

        return [
            'id' => $this->id,
            'sku' => $this->sku,
            'name' => $this->name,
            'name_ar' => $this->name_ar,
            // What the reader sees: the Arabic name for an Arabic reader when there is one (ADR-021).
            'display_name' => LocalizedName::pick($this->name, $this->name_ar),
            'description' => $this->description,
            'unit' => $this->unit,
            'is_active' => $this->is_active,

            // Money crosses the API as a STRING. The client formats it with
            // Intl and never does arithmetic on it (ADR-015).
            'price' => (string) $this->price,
            // NULL: this product follows the business VAT rate (ADR-018).
            'vat_rate' => $this->vat_rate === null ? null : (string) $this->vat_rate,

            'category' => $this->whenLoaded('category', fn (): ?array => $this->category ? [
                'id' => $this->category->id,
                'name' => $this->category->name,
                'display_name' => LocalizedName::pick($this->category->name, $this->category->name_ar),
                'slug' => $this->category->slug,
            ] : null),

            'stock' => $this->whenLoaded('inventoryItem', fn (): ?array => $this->inventoryItem ? [
                'on_hand' => $this->inventoryItem->stock_on_hand,
                'reorder_point' => $this->inventoryItem->reorder_point,
                'is_low' => $this->inventoryItem->isLowStock(),
            ] : null),

            /*
             * mergeWhen OMITS THE KEY ENTIRELY when the ability is absent.
             *
             * Not null — absent. A null still leaks that the field exists and
             * invites a client-side "fix" that reveals it (SECURITY.md §2.3).
             */
            $this->mergeWhen(
                $user?->can(Ability::ProductsViewCost->value) ?? false,
                fn (): array => ['cost' => (string) $this->cost],
            ),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
