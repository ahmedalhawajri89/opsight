<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\ConfirmOrder;
use App\Models\BusinessSetting;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Support\Money;

/*
|--------------------------------------------------------------------------
| Amounts keep their currency's own precision, end to end
|--------------------------------------------------------------------------
|
| The regression this guards: every total used to be stored and computed at
| two places whatever the currency, so BHD — the product's own default — and
| KWD, OMR and JOD lost their third decimal. A 1.255 BHD line was stored as
| 1.26 and shown as "1.260". Three places for a three-place currency, two for
| a two-place one, and the same rule from the order row to the API.
|
*/

function useCurrency(string $code, int $decimals): void
{
    BusinessSetting::current()->forceFill(['currency' => $code, 'currency_decimals' => $decimals])->save();
    BusinessSetting::flushCache();
}

function confirmSingleLine(string $price, string $cost, int $quantity = 1): Order
{
    $product = Product::factory()->withStock(100)->create(['price' => $price, 'cost' => $cost]);
    $order = Order::factory()->create();

    $order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $product->price,
        'unit_cost' => $product->cost,
        'quantity' => $quantity,
        'line_discount' => 0,
        'line_total' => 0,
    ]);

    return app(ConfirmOrder::class)($order)->refresh();
}

it('keeps the third decimal of a three-place currency through confirm', function (): void {
    useCurrency('BHD', 3);

    $order = confirmSingleLine(price: '1.255', cost: '0.8125', quantity: 3);

    // 3 × 1.255 = 3.765 exactly; 3 × 0.8125 = 2.4375 → 2.438 at three places.
    expect($order->items->first()->line_total)->toBe('3.765')
        ->and($order->subtotal_amount)->toBe('3.765')
        ->and($order->total_amount)->toBe('3.765')
        ->and($order->cogs_amount)->toBe('2.438');
});

it('rounds a two-place currency half-up, as before', function (): void {
    useCurrency('SAR', 2);

    $order = confirmSingleLine(price: '1.255', cost: '0.8125', quantity: 3);

    // 3.765 → 3.77; 2.4375 → 2.44.
    expect($order->items->first()->line_total)->toBe('3.77')
        ->and($order->total_amount)->toBe('3.77')
        ->and($order->cogs_amount)->toBe('2.44');
});

it('stores the exact column value, not a padded two-place one', function (): void {
    useCurrency('KWD', 3);

    $order = confirmSingleLine(price: '10.005', cost: '4.001');

    // Read past the model cast: the column itself must hold the third decimal.
    $raw = Order::query()->whereKey($order->id)->toBase()->value('total_amount');

    expect((string) $raw)->toBe('10.005');
});

it('reports net revenue at three places on the API', function (): void {
    useCurrency('BHD', 3);

    $owner = User::factory()->role(Role::Owner)->create();
    $order = confirmSingleLine(price: '1.255', cost: '0.500', quantity: 3);
    $day = $order->placed_at->timezone('Asia/Bahrain')->toDateString();

    $this->actingAs($owner)
        ->getJson("/api/v1/analytics/summary?from={$day}&to={$day}&compare=none")
        ->assertOk()
        ->assertJsonPath('data.net_revenue.value', '3.765');
});

it('keeps the third decimal of an expense', function (): void {
    useCurrency('OMR', 3);

    $expense = Expense::query()->create([
        'expense_category_id' => ExpenseCategory::query()->firstOrCreate(['name' => 'Utilities'], ['slug' => 'utilities'])->id,
        'amount' => '12.345',
        'incurred_on' => now()->toDateString(),
        'description' => 'Electricity',
    ]);

    expect($expense->refresh()->amount)->toBe('12.345')
        ->and(Money::scale())->toBe(3);
});
