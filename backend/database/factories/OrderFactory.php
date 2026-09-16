<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Domain\Orders\OrderStatus;
use App\Models\Customer;
use App\Models\Order;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/**
 * @extends Factory<Order>
 *
 * Creates DRAFT orders by default.
 *
 * There is deliberately no `confirmed()` state that simply sets the column: a
 * confirmed order has snapshots, frozen totals and matching stock movements,
 * and faking the status without them would produce rows that look valid and
 * break every metric test in a way that is hard to trace. Tests confirm an
 * order by running ConfirmOrder, which is also what production does.
 */
class OrderFactory extends Factory
{
    protected $model = Order::class;

    public function definition(): array
    {
        return [
            'reference' => 'ORD-'.now()->year.'-'.Str::upper(Str::random(8)),
            'customer_id' => Customer::factory(),
            'status' => OrderStatus::Draft,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'shipping_amount' => 0,
        ];
    }

    /** Walk-in: no customer, so new-customer metrics must exclude it. */
    public function walkIn(): static
    {
        return $this->state(fn (): array => ['customer_id' => null]);
    }

    public function forCustomer(Customer $customer): static
    {
        return $this->state(fn (): array => ['customer_id' => $customer->id]);
    }

    public function withCharges(float $discount = 0, float $tax = 0, float $shipping = 0): static
    {
        return $this->state(fn (): array => [
            'discount_amount' => $discount,
            'tax_amount' => $tax,
            'shipping_amount' => $shipping,
        ]);
    }
}
