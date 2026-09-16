<?php

declare(strict_types=1);

namespace App\Http\Requests\Orders;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Adding a line to a draft order.
 *
 * Accepts a product id and a quantity. NOT a price — the price is read from the
 * catalog and snapshotted at confirm, and letting a client name its own price
 * would make every revenue figure a suggestion.
 */
class AddOrderItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('update', $this->route('order')) ?? false;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            'product_id' => [
                'required',
                'integer',
                // An inactive product cannot be added to a new order, though it
                // stays fully visible in analytics (MVP_SCOPE.md §6.5).
                Rule::exists('products', 'id')->whereNull('deleted_at')->where('is_active', true),
            ],
            'quantity' => ['required', 'integer', 'min:1', 'max:100000'],
            'line_discount' => ['nullable', 'numeric', 'min:0'],
        ];
    }

    /** @return array<string, string> */
    public function messages(): array
    {
        return [
            'product_id.exists' => 'That product does not exist or is no longer active.',
            'quantity.min' => 'A line must have at least one unit.',
        ];
    }
}
