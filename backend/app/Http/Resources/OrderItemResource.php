<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Authorization\Ability;
use App\Models\OrderItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin OrderItem
 *
 * The snapshot columns are what make historical reporting correct, so they are
 * served from this row and never re-read from the catalog.
 */
class OrderItemResource extends JsonResource
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
            'product_id' => $this->product_id,

            // Snapshots, as recorded at confirm time.
            'product_name' => $this->product_name,
            'product_sku' => $this->product_sku,
            'unit_price' => (string) $this->unit_price,

            'quantity' => $this->quantity,
            'line_discount' => (string) $this->line_discount,
            'line_total' => (string) $this->line_total,

            $this->mergeWhen(
                $user?->can(Ability::ProductsViewCost->value) ?? false,
                fn (): array => ['unit_cost' => (string) $this->unit_cost],
            ),
        ];
    }
}
