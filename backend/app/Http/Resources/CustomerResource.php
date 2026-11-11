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
    /**
     * Integer keys too: `mergeWhen` sits in the list as a value that the
     * resource flattens when it resolves.
     *
     * @return array<int|string, mixed>
     */
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
            /*
             * Read with getAttribute: these exist only when the query added
             * them, so they are not properties of the model, and reading
             * them as if they were let a static check see a count that could
             * never be null.
             */
            $this->mergeWhen($this->resource->getAttribute('orders_count') !== null, fn (): array => [
                'orders_count' => (int) $this->resource->getAttribute('orders_count'),
                'lifetime_value' => $this->resource->getAttribute('lifetime_value') === null
                    ? null
                    : (string) $this->resource->getAttribute('lifetime_value'),
                'last_order_at' => $this->resource->getAttribute('last_order_at')
                    ? Carbon::parse((string) $this->resource->getAttribute('last_order_at'))->toIso8601String()
                    : null,
            ]),

            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
