<?php

declare(strict_types=1);

namespace App\Http\Requests\Products;

use App\Authorization\Ability;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('product')) ?? false;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        $rules = [
            'name' => ['sometimes', 'string', 'max:180'],
            // The Arabic name, shown to Arabic readers when present (ADR-021).
            'name_ar' => ['nullable', 'string', 'max:180'],
            'description' => ['nullable', 'string', 'max:5000'],
            'category_id' => ['nullable', 'integer', Rule::exists('categories', 'id')->whereNull('deleted_at')],
            'price' => ['sometimes', 'numeric', 'min:0', 'max:99999999999'],
            // A percentage; NULL follows the business rate, 0 is zero-rated (ADR-018).
            'vat_rate' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'unit' => ['sometimes', 'string', 'max:24'],
            'low_stock_threshold' => ['nullable', 'integer', 'min:0'],
        ];

        if ($this->user()?->can(Ability::ProductsViewCost->value)) {
            $rules['cost'] = ['sometimes', 'numeric', 'min:0', 'max:99999999999'];
        }

        return $rules;
    }

    /**
     * `sku` is deliberately absent from the rules.
     *
     * It is immutable after creation: order lines snapshot it, and changing it
     * would make a historical order reference a SKU that never sold. It is also
     * not fillable on the model, so this is belt and braces.
     */
    public function prepareForValidation(): void
    {
        $this->request->remove('sku');
    }
}
