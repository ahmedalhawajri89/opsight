<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Insights\Insight;
use App\Domain\Insights\InsightEngine;
use App\Domain\Metrics\Comparison;
use App\Domain\Orders\OrderStatus;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Carbon;
use Tests\Support\InsightFixture;

/*
|--------------------------------------------------------------------------
| The four rules nothing was asserting
|--------------------------------------------------------------------------
|
| Concentration, dormant customers, cancellations and stockout risk run on
| every /insights call, so a fatal error in one would have surfaced — but
| nothing checked that they fire on the shape they describe, or that they stay
| quiet otherwise. The second half is the one that matters: a feed that cries
| wolf is worse than no feed (METRICS.md §4).
|
*/

function insightIds(?User $user = null): array
{
    $insights = app(InsightEngine::class)->for(
        InsightFixture::period(),
        Comparison::PreviousPeriod,
        $user ?? User::factory()->role(Role::Owner)->create(),
    );

    return array_map(static fn (Insight $insight): string => $insight->id, $insights);
}

/** A fulfilled order for one customer, on a given day, at a given value. */
function saleOn(string $day, Customer $customer, float $value, Product $product): Order
{
    $order = Order::factory()->forCustomer($customer)->create();

    $order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $value,
        'unit_cost' => $value / 2,
        'quantity' => 1,
        'line_discount' => 0,
        'line_total' => $value,
    ]);

    $order->forceFill([
        'status' => OrderStatus::Fulfilled,
        'placed_at' => Carbon::parse($day, config('app.timezone'))->setTime(12, 0),
        'fulfilled_at' => Carbon::parse($day, config('app.timezone'))->setTime(14, 0),
        'subtotal_amount' => $value,
        'total_amount' => $value,
        'cogs_amount' => $value / 2,
    ])->save();

    return $order;
}

/*
|--------------------------------------------------------------------------
| One customer carrying the month
|--------------------------------------------------------------------------
*/

it('reports a customer carrying more than a quarter of revenue', function (): void {
    // The ordinary month, then one customer worth more than all of it.
    InsightFixture::build();

    $product = Product::factory()->priced(100.0000, 40.0000)->withStock(1000)->create();
    saleOn(InsightFixture::CURRENT_FROM, Customer::factory()->create(['name' => 'One Big Buyer']), 4000.0, $product);

    expect(insightIds())->toContain('customer_concentration');
});

it('stays silent when revenue is spread across customers', function (): void {
    // Twelve customers, one order each: no single share reaches a quarter.
    InsightFixture::build();

    expect(insightIds())->not->toContain('customer_concentration');
});

/*
|--------------------------------------------------------------------------
| Customers who stopped coming
|--------------------------------------------------------------------------
*/

it('reports customers who have not ordered in ninety days', function (): void {
    InsightFixture::build();

    // The threshold is three; these four last bought half a year ago.
    $product = Product::factory()->priced(50.0000, 20.0000)->withStock(1000)->create();

    foreach (range(1, 4) as $index) {
        saleOn(
            Carbon::now()->subDays(200)->toDateString(),
            Customer::factory()->create(['name' => "Lapsed {$index}"]),
            50.0,
            $product,
        );
    }

    expect(insightIds())->toContain('dormant_customers');
});

it('stays silent when too few customers have lapsed', function (): void {
    $product = Product::factory()->priced(50.0000, 20.0000)->withStock(1000)->create();

    // Two is below the minimum of three.
    foreach (range(1, 2) as $index) {
        saleOn(
            Carbon::now()->subDays(200)->toDateString(),
            Customer::factory()->create(['name' => "Lapsed {$index}"]),
            50.0,
            $product,
        );
    }

    // And a customer who bought this week is not dormant at all.
    saleOn(Carbon::now()->subDay()->toDateString(), Customer::factory()->create(), 50.0, $product);

    expect(insightIds())->not->toContain('dormant_customers');
});

/*
|--------------------------------------------------------------------------
| Cancellations climbing
|--------------------------------------------------------------------------
*/

it('reports cancellations that both rose and are high', function (): void {
    InsightFixture::build();

    /*
     * Both conditions must hold: the rate is above the floor (10%) AND it rose
     * by at least five points against the previous month. Cancelling a third
     * of this month's orders does both, since the previous month cancelled
     * none.
     */
    $product = Product::factory()->priced(100.0000, 40.0000)->withStock(1000)->create();

    foreach (range(1, 6) as $index) {
        $order = saleOn(InsightFixture::CURRENT_FROM, Customer::factory()->create(), 100.0, $product);
        $order->forceFill(['status' => OrderStatus::Cancelled, 'cancelled_at' => now()])->save();
    }

    expect(insightIds())->toContain('cancellation_spike');
});

it('stays silent on a cancellation rate that has not moved', function (): void {
    // One cancellation in each month: a rate that is low and flat.
    InsightFixture::build();

    $product = Product::factory()->priced(100.0000, 40.0000)->withStock(1000)->create();

    foreach ([InsightFixture::PREVIOUS_FROM, InsightFixture::CURRENT_FROM] as $month) {
        $order = saleOn($month, Customer::factory()->create(), 100.0, $product);
        $order->forceFill(['status' => OrderStatus::Cancelled, 'cancelled_at' => now()])->save();
    }

    expect(insightIds())->not->toContain('cancellation_spike');
});

/*
|--------------------------------------------------------------------------
| Stock about to run out
|--------------------------------------------------------------------------
*/

it('reports a product selling faster than its remaining cover', function (): void {
    // Selling four a day for the last week, with three left: under a day of
    // cover against a seven-day threshold.
    $product = Product::factory()->priced(20.0000, 8.0000)->withStock(3)->create();
    $customer = Customer::factory()->create();

    foreach (range(1, 7) as $day) {
        $order = saleOn(Carbon::now()->subDays($day)->toDateString(), $customer, 20.0, $product);
        $order->items()->update(['quantity' => 4]);
    }

    expect(insightIds())->toContain('stockout_risk');
});

it('stays silent when the shelf holds more than a week of sales', function (): void {
    // The same rate of sale, with a thousand on the shelf.
    $product = Product::factory()->priced(20.0000, 8.0000)->withStock(1000)->create();
    $customer = Customer::factory()->create();

    foreach (range(1, 7) as $day) {
        $order = saleOn(Carbon::now()->subDays($day)->toDateString(), $customer, 20.0, $product);
        $order->items()->update(['quantity' => 4]);
    }

    expect(insightIds())->not->toContain('stockout_risk');
});
