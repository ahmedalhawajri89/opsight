<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Expense;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Expense
 *
 * The whole module is gated by expenses.view, so there is no field-level
 * redaction here — a role that cannot see expenses never reaches this resource.
 */
class ExpenseResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'description' => $this->description,
            'amount' => (string) $this->amount,

            // A calendar date, not an instant.
            'incurred_on' => $this->incurred_on->toDateString(),

            'vendor' => $this->vendor,
            'reference' => $this->reference,
            'notes' => $this->notes,

            'category' => $this->whenLoaded('category', fn (): array => [
                'id' => $this->category->id,
                'name' => $this->category->name,
                'slug' => $this->category->slug,
            ]),

            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
