<?php

declare(strict_types=1);

namespace App\Http\Requests\Orders;

use App\Models\Order;
use App\Support\Tenancy\TenantRule;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Order write requests.
 *
 * Note what NONE of these accept: a price, a cost, a line total, an order total
 * or a status. Every one of those is computed or transitioned server-side, and
 * accepting them from a client would be the whole integrity model undone
 * (SECURITY.md §6).
 */
class StoreOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user()?->can('create', Order::class) ?? false;
    }

    /** @return array<string, array<int, mixed>> */
    public function rules(): array
    {
        return [
            // Nullable: walk-in trade has no customer record.
            'customer_id' => ['nullable', 'integer', TenantRule::exists('customers')->whereNull('deleted_at')],
            'notes' => ['nullable', 'string', 'max:5000'],
            'discount_amount' => ['nullable', 'numeric', 'min:0'],
            'tax_amount' => ['nullable', 'numeric', 'min:0'],
            'shipping_amount' => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
