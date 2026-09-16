<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Authorization\Ability;
use App\Models\InventoryMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin InventoryMovement
 */
class InventoryMovementResource extends JsonResource
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
            'quantity_delta' => $this->quantity_delta,
            'balance_after' => $this->balance_after,
            'reason' => $this->reason,
            'reference_type' => $this->reference_type,
            'reference_id' => $this->reference_id,
            'note' => $this->note,
            'occurred_at' => $this->occurred_at->toIso8601String(),

            'created_by' => $this->whenLoaded('creator', fn (): ?array => $this->creator ? [
                'id' => $this->creator->id,
                'name' => $this->creator->name,
            ] : null),

            // A restock cost is a cost figure like any other.
            $this->mergeWhen(
                $user?->can(Ability::ProductsViewCost->value) ?? false,
                fn (): array => [
                    'unit_cost' => $this->unit_cost !== null ? (string) $this->unit_cost : null,
                ],
            ),
        ];
    }
}
