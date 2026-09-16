<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\InventoryItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin InventoryItem
 */
class InventoryItemResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'product_id' => $this->product_id,
            'stock_on_hand' => $this->stock_on_hand,
            'reorder_point' => $this->reorder_point,
            'threshold' => $this->effectiveThreshold(),
            'is_low' => $this->isLowStock(),
            'last_movement_at' => $this->last_movement_at?->toIso8601String(),

            'product' => $this->whenLoaded('product', fn (): array => [
                'id' => $this->product->id,
                'sku' => $this->product->sku,
                'name' => $this->product->name,
                'unit' => $this->product->unit,
                'is_active' => $this->product->is_active,
            ]),
        ];
    }
}
