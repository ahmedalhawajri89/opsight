<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Forecast\StockForecast;
use App\Domain\Orders\OrderStatus;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Carbon\CarbonImmutable;

/*
|--------------------------------------------------------------------------
| When each product runs out (phase D1)
|--------------------------------------------------------------------------
|
| Sales are written week by week so every rate here can be worked out by
| hand: an even seven units a week is one a day.
|
*/

/** The forecast's "today": a Wednesday, in the business's zone. */
function forecastToday(): CarbonImmutable
{
    return CarbonImmutable::parse('2026-11-11 10:00', 'Asia/Bahrain');
}

/**
 * Sells `units` of the product in each of the last weeks, newest LAST.
 *
 * @param  list<int>  $perWeek  oldest first, ending with the week before today
 */
function sellWeekly(Product $product, array $perWeek): void
{
    $weeks = count($perWeek);

    foreach ($perWeek as $i => $units) {
        if ($units === 0) {
            continue;
        }

        // Mid-week, well inside the window, in local time.
        $placed = forecastToday()->startOfDay()->subDays(($weeks - $i) * 7 - 3)->setTime(12, 0);
        $order = Order::factory()->create(['status' => OrderStatus::Fulfilled, 'placed_at' => $placed->utc()]);
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => 10,
            'unit_cost' => 4,
            'quantity' => $units,
            'line_discount' => 0,
            'line_total' => 10 * $units,
        ]);
    }
}

function forecastFor(Product $product, int $lead = 7, int $cover = 30, bool $cost = true): ?array
{
    $result = app(StockForecast::class)->for($lead, $cover, $cost, forecastToday());

    return collect($result['items'])->firstWhere('product_id', $product->id);
}

it('turns steady sales into a daily rate, a run-out date and an order-by date', function (): void {
    $lamp = Product::factory()->withStock(30)->create(['sku' => 'LAMP-1', 'cost' => '4']);
    sellWeekly($lamp, array_fill(0, 12, 7));   // one a day, every week

    $item = forecastFor($lamp, lead: 7, cover: 30);

    expect($item['daily_rate'])->toBe(1.0)
        ->and($item['days_left'])->toBe(30.0)
        ->and($item['run_out_on'])->toBe('2026-12-11')
        // Order a week before it runs out, to allow for the supplier.
        ->and($item['order_by'])->toBe('2026-12-04')
        // Enough for the lead time and 30 days, less the 30 on the shelf.
        ->and($item['suggested_quantity'])->toBe(7)
        ->and($item['suggested_cost'])->toBe('28.000')
        ->and($item['confidence'])->toBe('high')
        ->and($item['status'])->toBe('ok');
});

it('notices a product that has started selling faster', function (): void {
    $steady = Product::factory()->withStock(100)->create(['sku' => 'STEADY']);
    $rising = Product::factory()->withStock(100)->create(['sku' => 'RISING']);
    sellWeekly($steady, array_fill(0, 12, 7));
    sellWeekly($rising, [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 21, 21]);

    expect(forecastFor($rising)['daily_rate'])->toBeGreaterThan(forecastFor($steady)['daily_rate']);
});

it('puts what must be ordered now above what can wait', function (): void {
    $low = Product::factory()->withStock(5)->create(['sku' => 'LOW']);
    $plenty = Product::factory()->withStock(500)->create(['sku' => 'PLENTY']);
    sellWeekly($low, array_fill(0, 12, 7));
    sellWeekly($plenty, array_fill(0, 12, 7));

    $items = app(StockForecast::class)->for(7, 30, true, forecastToday())['items'];

    expect($items[0]['sku'])->toBe('LOW')
        ->and($items[0]['status'])->toBe('order_now')
        // An order-by date already past is "today", not a date in the past.
        ->and($items[0]['order_by'])->toBe('2026-11-11');
});

it('does not read an empty shelf as falling demand', function (): void {
    /*
     * Sold seven a week until it ran out two weeks ago. Those two zero weeks
     * are a shortage, not a lack of buyers; counting them would suggest
     * ordering less of the very product people were asking for.
     */
    $board = Product::factory()->create(['sku' => 'BOARD']);
    sellWeekly($board, [7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 0, 0]);

    $item = forecastFor($board);

    expect($item['daily_rate'])->toBe(1.0)
        ->and($item['status'])->toBe('out');
});

it('says how wrong it was over the last four weeks', function (): void {
    /*
     * Seven a week for eight weeks, then fourteen a week for four. Four weeks
     * ago the method predicted 28 for the last four weeks; 56 sold. Its error
     * was 28 of 56, half, so its accuracy is 50%.
     */
    $lamp = Product::factory()->withStock(100)->create();
    sellWeekly($lamp, [7, 7, 7, 7, 7, 7, 7, 7, 14, 14, 14, 14]);

    expect(app(StockForecast::class)->for(7, 30, true, forecastToday())['accuracy'])->toBe(0.5);
});

it('leaves out products that are not selling, and gives a scattered seller low confidence', function (): void {
    $idle = Product::factory()->withStock(10)->create(['sku' => 'IDLE']);
    $scattered = Product::factory()->withStock(10)->create(['sku' => 'SCATTER']);
    sellWeekly($scattered, [0, 0, 0, 0, 0, 0, 0, 0, 0, 30, 0, 0]);

    expect(forecastFor($idle))->toBeNull()
        ->and(forecastFor($scattered)['confidence'])->toBe('low');
});

it('ignores drafts and cancelled orders', function (): void {
    $lamp = Product::factory()->withStock(10)->create();
    $order = Order::factory()->create(['status' => OrderStatus::Cancelled, 'placed_at' => forecastToday()->subDays(5)->utc()]);
    $order->items()->create(['product_id' => $lamp->id, 'product_name' => 'x', 'product_sku' => 'x', 'unit_price' => 1, 'unit_cost' => 1, 'quantity' => 50, 'line_discount' => 0, 'line_total' => 50]);

    expect(forecastFor($lamp))->toBeNull();
});

it('keeps the order cost from a role that may not see cost', function (): void {
    $lamp = Product::factory()->withStock(5)->create();
    sellWeekly($lamp, array_fill(0, 12, 7));

    expect(forecastFor($lamp, cost: false)['suggested_cost'])->toBeNull();
});

it('serves the forecast to whoever may see the inventory, with their settings', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->getJson('/api/v1/forecasts/stock?lead_time=14&cover_days=60')
        ->assertOk()
        ->assertJsonPath('data.lead_time_days', 14)
        ->assertJsonPath('data.cover_days', 60);

    $this->actingAs($owner)->getJson('/api/v1/forecasts/stock?lead_time=500')->assertUnprocessable();
});
