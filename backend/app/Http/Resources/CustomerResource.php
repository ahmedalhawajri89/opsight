<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Customer;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Customer
 */
class CustomerResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'email' => $this->email,
            'phone' => $this->phone,
            'company' => $this->company,
            'vat_number' => $this->vat_number,
            'address_line' => $this->address_line,
            'city' => $this->city,
            'country' => $this->country,
            'notes' => $this->notes,
            'is_active' => $this->is_active,

            // Order counts and lifetime value are METRICS, not columns. They
            // arrive from the analytics endpoints in Phase 04, computed from
            // orders, so they can never go stale (DATABASE_DESIGN.md §3.5).

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
