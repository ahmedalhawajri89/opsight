<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Customer;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Customer> */
class CustomerFactory extends Factory
{
    protected $model = Customer::class;

    public function definition(): array
    {
        return [
            'name' => fake()->company(),
            'email' => fake()->unique()->companyEmail(),
            'phone' => fake()->optional()->phoneNumber(),
            'company' => fake()->optional()->company(),
            'city' => fake()->optional()->city(),
            'country' => fake()->optional()->countryCode(),
            'is_active' => true,
        ];
    }

    /** Walk-in trade: no email, which the unique index must allow. */
    public function anonymous(): static
    {
        return $this->state(fn (): array => ['email' => null, 'name' => 'Walk-in']);
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['is_active' => false]);
    }
}
