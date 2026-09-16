<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Models\Expense;
use App\Models\ExpenseCategory;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Expense> */
class ExpenseFactory extends Factory
{
    protected $model = Expense::class;

    public function definition(): array
    {
        return [
            'expense_category_id' => ExpenseCategory::factory(),
            'description' => fake()->sentence(3),
            'amount' => fake()->randomFloat(2, 10, 5000),
            'incurred_on' => fake()->dateTimeBetween('-1 year')->format('Y-m-d'),
            'vendor' => fake()->optional()->company(),
        ];
    }
}
