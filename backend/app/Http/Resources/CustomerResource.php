<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Customer;
use App\Support\Localization\LocalizedName;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Carbon;

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
            'name_ar' => $this->name_ar,
            'display_name' => LocalizedName::pick($this->name, $this->name_ar),
            'email' => $this->email,
            'phone' => $this->phone,
            'company' => $this->company,
            'vat_number' => $this->vat_number,
            'address_line' => $this->address_line,
            'city' => $this->city,
            'country' => $this->country,
            'notes' => $this->notes,
            'is_active' => $this->is_active,
            // Set once a data-subject erasure has run (ADR-026). The screen
            // reads this rather than sniffing the name for a sentinel, and it
            // writes its own words in the reader's language.
            'erased_at' => $this->erased_at?->toIso8601String(),

            /*
             * Order count and lifetime value are METRICS, not columns — never
             * stored, so they can never go stale (DATABASE_DESIGN.md §3.5).
             * The listing computes them as correlated subqueries over
             * qualifying orders (CustomerController::withTrade), and they are
             * present only on the endpoints that asked for them.
             *
             * `whenNotNull`, not `whenHas`: a customer with no qualifying
             * orders gets NULL from SUM and MAX but 0 from COUNT, so the
             * count is sent as a real zero — "has never ordered" is a fact
             * worth stating — while the value and the date stay absent rather
             * than claiming a lifetime value of nothing and a last order at
             * the epoch.
             */
            $this->mergeWhen($this->orders_count !== null, fn (): array => [
                'orders_count' => (int) $this->orders_count,
                'lifetime_value' => $this->lifetime_value === null
                    ? null
                    : (string) $this->lifetime_value,
                'last_order_at' => $this->last_order_at
                    ? Carbon::parse($this->last_order_at)->toIso8601String()
                    : null,
            ]),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
