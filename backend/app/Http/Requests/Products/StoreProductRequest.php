<?php

declare(strict_types=1);

namespace App\Http\Requests\Products;

use App\Authorization\Ability;
use App\Models\Product;
use App\Support\Tenancy\TenantRule;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Product::class) ?? false;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $rules = [
            'sku' => ['required', 'string', 'max:64', TenantRule::unique('products', 'sku')],
            'name' => ['required', 'string', 'max:180'],
            // The Arabic name, shown to Arabic readers when present (ADR-021).
            'name_ar' => ['nullable', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:5000'],
            'category_id' => ['nullable', 'integer', TenantRule::exists('categories')->whereNull('deleted_at')],
            'price' => ['required', 'numeric', 'min:0', 'max:99999999999'],
            // A percentage; NULL follows the business rate, 0 is zero-rated (ADR-018).
            'vat_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'unit' => ['nullable', 'string', 'max:24'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0'],
            'opening_stock' => ['nullable', 'integer', 'min:0'],
        ];

        /*
         * `cost` is only an accepted field for a role that may read it.
         *
         * The rule set itself excludes it, so a request carrying cost from a
         * cost-blind role is rejected rather than silently ignored — and the
         * create form can never become an oracle for the hidden value
         * (ROLES_AND_PERMISSIONS.md §3.2).
         */
        if ($this->user()?->can(Ability::ProductsViewCost->value)) {
            $rules['cost'] = ['required', 'numeric', 'min:0', 'max:99999999999'];
        }

        return $rules;
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'sku.unique' => 'This SKU is already in use.',
            'cost.required' => 'A unit cost is required so margin can be calculated.',
        ];
    }
}
