<?php

declare(strict_types=1);

namespace Database\Factories;

use App\Domain\Inventory\AdjustStock;
use App\Models\Category;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Product;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Str;

/** @extends Factory<Product> */
class ProductFactory extends Factory
{
    protected $model = Product::class;

    public function definition(): array
    {
        $cost = fake()->randomFloat(4, 5, 400);

        return [
            'sku' => 'SKU-'.Str::upper(Str::random(8)),
            'name' => ucfirst(fake()->unique()->words(2, true)),
            'description' => fake()->optional()->sentence(),
            'category_id' => Category::factory(),
            // Price above cost by a plausible margin, so seeded data has a
            // realistic margin rather than a uniform one.
            'price' => round($cost * fake()->randomFloat(2, 1.25, 2.4), 4),
            'cost' => $cost,
            'unit' => 'piece',
            'is_active' => true,
        ];
    }

    /**
     * Every product gets an inventory row, because a product without one is a
     * product whose stock cannot be tracked — and the confirm path would have
     * to invent one mid-transaction.
     */
    public function configure(): static
    {
        return $this->afterCreating(function (Product $product): void {
            InventoryItem::firstOrCreate(
                ['product_id' => $product->id],
                ['reorder_point' => 10],
            );
        });
    }

    /** Seed opening stock through the ledger, so the invariant holds. */
    public function withStock(int $quantity): static
    {
        return $this->afterCreating(function (Product $product) use ($quantity): void {
            if ($quantity === 0) {
                return;
            }

            app(AdjustStock::class)->adjust(
                product: $product,
                delta: $quantity,
                note: 'Opening stock',
                reason: InventoryMovement::REASON_INITIAL,
            );
        });
    }

    public function priced(float $price, float $cost): static
    {
        return $this->state(fn (): array => ['price' => $price, 'cost' => $cost]);
    }

    public function inactive(): static
    {
        return $this->state(fn (): array => ['is_active' => false]);
    }
}
