<?php

declare(strict_types=1);

use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\Period;
use App\Domain\Metrics\TimeSeries;
use App\Models\BusinessSetting;
use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\Support\MetricFixture;

/*
|--------------------------------------------------------------------------
| The dashboard's panels
|--------------------------------------------------------------------------
|
| The data behind the redesigned dashboard: expenses over time, revenue by
| category, and the spread of stock. Each is held to a figure computed a
| different way, so a panel cannot quietly become a second definition of a
| metric the rest of the application already reports.
|
*/

/** Sets one product's stock and thresholds directly, bypassing the ledger. */
function stockAt(int $onHand, int $reorderPoint = 0, ?int $productThreshold = null): Product
{
    $product = Product::factory()->create(['low_stock_threshold' => $productThreshold]);

    InventoryItem::query()->where('product_id', $product->id)->update([
        'stock_on_hand' => $onHand,
        'reorder_point' => $reorderPoint,
    ]);

    return $product;
}

/* -------------------------------------------------------------------------- */
/* Expenses over time */
/* -------------------------------------------------------------------------- */

it('buckets operating expenses so they sum to the period total', function (): void {
    MetricFixture::build();
    $this->actingAs(User::factory()->owner()->create());

    $range = '?preset=custom&from='.MetricFixture::FROM.'&to='.MetricFixture::TO;

    $series = $this->getJson("/api/v1/analytics/timeseries{$range}&metric=operating_expenses&grain=day")
        ->assertOk()
        ->json('data');

    // August's two expenses, and not July's.
    $total = array_reduce($series, fn (string $sum, array $bucket) => bcadd($sum, (string) $bucket['value'], 2), '0');

    expect($total)->toBe(MetricFixture::EXPECTED['operating_expenses'])
        ->and(collect($series)->firstWhere('bucket', '2026-08-05')['value'])->toBe('90.00')
        ->and(collect($series)->firstWhere('bucket', '2026-08-06')['value'])->toBe('0.00');
});

it('refuses expenses over time to a role that cannot see cost', function (): void {
    $this->actingAs(User::factory()->manager()->create());
    $this->getJson('/api/v1/analytics/timeseries?metric=operating_expenses')->assertOk();

    // Staff see neither analytics nor cost.
    $this->actingAs(User::factory()->staff()->create())
        ->getJson('/api/v1/analytics/timeseries?metric=operating_expenses')
        ->assertForbidden();
});

it('sends the cost panels to a role that may see cost, and omits them otherwise', function (): void {
    MetricFixture::build();

    $owner = $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard')
        ->assertOk();

    expect($owner->json('data'))->toHaveKeys(['expenses_trend', 'cash_flow', 'profit_trend'])
        ->and($owner->json('data.cash_flow.revenue'))->toHaveCount(6)
        ->and($owner->json('data.cash_flow.expenses'))->toHaveCount(6);

    $staff = $this->actingAs(User::factory()->staff()->create())
        ->getJson('/api/v1/dashboard')
        ->assertOk();

    // Absent, not empty: the keys are never sent.
    foreach (['expenses_trend', 'cash_flow', 'profit_trend'] as $key) {
        $staff->assertJsonMissingPath("data.{$key}");
    }

    // Revenue-only panels are for everyone who sees the dashboard.
    expect($staff->json('data'))->toHaveKeys(['orders_trend', 'category_breakdown', 'inventory_status']);
});

it('covers the last six calendar months, the current one included, in the cash flow panel', function (): void {
    $response = $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard')
        ->assertOk();

    $months = collect($response->json('data.cash_flow.revenue'));

    expect($months->first()['bucket'])->toEndWith('-01')
        ->and($months->last()['is_partial'])->toBeTrue()
        ->and($response->json('data.cash_flow.period.to'))->toBe(now(config('app.timezone'))->setTimezone(
            BusinessSetting::current()->timezone,
        )->toDateString());
});

/* -------------------------------------------------------------------------- */
/* Revenue by category */
/* -------------------------------------------------------------------------- */

it('breaks the period sales down by category, summing to the whole', function (): void {
    MetricFixture::build();

    $rows = $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard?preset=custom&from='.MetricFixture::FROM.'&to='.MetricFixture::TO)
        ->assertOk()
        ->json('data.category_breakdown');

    $total = array_reduce($rows, fn (string $sum, array $row) => bcadd($sum, (string) $row['value'], 2), '0');

    /*
     * The breakdown ranks by LINE totals, like the product ranking beside it:
     * an order-level discount or refund belongs to the order, not to any one
     * category, so it cannot be divided between them without inventing an
     * allocation. The slices therefore sum to line sales (600 in the fixture),
     * not to the net revenue headline (540) — which is why the chart shows
     * shares rather than presenting its total as net revenue.
     */
    expect($total)->toBe('600.00')
        ->and(round(collect($rows)->sum('share'), 4))->toBe(1.0);
});

/* -------------------------------------------------------------------------- */
/* Stock */
/* -------------------------------------------------------------------------- */

it('uses one definition of low stock everywhere', function (): void {
    /*
     * Regression. The dashboard count honoured a product threshold, the list
     * beside it and the inventory filter only read the reorder point, and
     * nothing honoured the business default. Each product below is low under
     * exactly one step of the rule.
     */
    DB::table('business_settings')->update(['default_low_stock_threshold' => 10]);

    $byProductThreshold = stockAt(onHand: 15, reorderPoint: 5, productThreshold: 20);
    $byReorderPoint = stockAt(onHand: 4, reorderPoint: 5);
    $byDefault = stockAt(onHand: 8, reorderPoint: 0);
    $healthy = stockAt(onHand: 50, reorderPoint: 5);

    $low = [$byProductThreshold->id, $byReorderPoint->id, $byDefault->id];

    $this->actingAs(User::factory()->owner()->create());

    $dashboard = $this->getJson('/api/v1/dashboard')->assertOk();
    $filtered = $this->getJson('/api/v1/inventory?filter[low_stock]=true&per_page=100')->assertOk();
    $products = $this->getJson('/api/v1/products?filter[low_stock]=true&per_page=100')->assertOk();

    $ids = fn (array $rows, string $key) => collect($rows)->pluck($key)->sort()->values()->all();

    expect($dashboard->json('data.low_stock.count'))->toBe(3)
        ->and($ids($dashboard->json('data.low_stock.items'), 'product_id'))->toBe($low)
        ->and($ids($filtered->json('data'), 'product_id'))->toBe($low)
        ->and($ids($products->json('data'), 'id'))->toBe($low)
        ->and($ids($filtered->json('data'), 'product_id'))->not->toContain($healthy->id);

    // And the model's own rule agrees with the SQL for every row.
    foreach (InventoryItem::with('product')->get() as $item) {
        expect($item->isLowStock())->toBe(in_array($item->product_id, $low, true));
    }
});

it('splits the catalogue into in stock, low and out of stock, summing to the whole', function (): void {
    DB::table('business_settings')->update(['default_low_stock_threshold' => 10]);

    stockAt(onHand: 0);
    stockAt(onHand: 0);
    stockAt(onHand: 3);
    stockAt(onHand: 40);
    stockAt(onHand: 41);

    // An inactive product is not part of the catalogue being described.
    $inactive = stockAt(onHand: 0);
    DB::table('products')->where('id', $inactive->id)->update(['is_active' => false]);

    $status = app(MetricCalculator::class)->inventoryStatus();

    expect($status)->toBe(['total' => 5, 'in_stock' => 2, 'low' => 1, 'out' => 2])
        // Low stock as the rest of the application counts it includes empty shelves.
        ->and(app(MetricCalculator::class)->lowStockCount())->toBe($status['low'] + $status['out']);
});

it('guards expenses over time by the cost ability itself, not only by the route', function (): void {
    // The route's analytics.view check happens to stop staff first; the series
    // must refuse on its own, for any future caller that is not that route.
    $staff = User::factory()->staff()->create();

    expect(fn () => app(TimeSeries::class)->build(
        Period::preset('30d'),
        'operating_expenses',
        'day',
        $staff,
    ))->toThrow(HttpException::class);
});

/* -------------------------------------------------------------------------- */
/* Top products and quick stats */
/* -------------------------------------------------------------------------- */

it('gives each top product its units and its trend against the comparison period', function (): void {
    MetricFixture::build();

    $rows = collect($this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard?preset=custom&from='.MetricFixture::FROM.'&to='.MetricFixture::TO)
        ->assertOk()
        ->json('data.top_products'));

    $widget = $rows->firstWhere('key', 'WIDGET');

    // WIDGET: 2 + 1 + 1 units at 100 = 400; nothing sold in July, so no trend.
    expect($widget['units'])->toBe(4)
        ->and($widget['value'])->toBe('400.00')
        ->and($widget['previous_value'])->toBeNull()
        ->and($widget['change_pct'])->toBeNull();
});

it('counts products and customers at the end of the period, with growth across it', function (): void {
    $start = now()->subDays(20);

    Product::factory()->count(4)->create(['created_at' => now()->subDays(60)]);
    Product::factory()->create(['created_at' => now()->subDays(5)]);

    $stats = $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard?preset=30d')
        ->assertOk()
        ->json('data.quick_stats');

    // Four existed when the 30 days began; five exist at the end: +25%.
    expect($stats['products']['value'])->toBe(5)
        ->and($stats['products']['change'])->toBe(0.25)
        ->and($stats)->toHaveKeys(['customers', 'inventory_value', 'active_users']);

    unset($start);
});

it('keeps cost and administration out of a staff member\'s quick stats', function (): void {
    $stats = $this->actingAs(User::factory()->staff()->create())
        ->getJson('/api/v1/dashboard')
        ->assertOk()
        ->json('data.quick_stats');

    expect($stats)->toHaveKeys(['products', 'customers'])
        ->and($stats)->not->toHaveKey('inventory_value')
        ->and($stats)->not->toHaveKey('active_users');
});

it('accepts the last twelve months as a period', function (): void {
    $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard?preset=365d')
        ->assertOk()
        ->assertJsonPath('meta.period.from', now(BusinessSetting::current()->timezone)->subDays(364)->toDateString());
});

it('charts margin and average order value per bucket, empty where there was nothing to divide', function (): void {
    MetricFixture::build();
    $this->actingAs(User::factory()->owner()->create());

    $range = '?preset=custom&from='.MetricFixture::FROM.'&to='.MetricFixture::TO;

    $margin = collect($this->getJson("/api/v1/analytics/timeseries{$range}&metric=gross_margin&grain=day")->assertOk()->json('data'));
    $aov = collect($this->getJson("/api/v1/analytics/timeseries{$range}&metric=average_order_value&grain=day")->assertOk()->json('data'));

    // Every order in the fixture is on the 15th, so that day equals the period.
    expect(round($margin->firstWhere('bucket', '2026-08-15')['value'], 4))->toBe(round(MetricFixture::EXPECTED['gross_margin'], 4))
        ->and($aov->firstWhere('bucket', '2026-08-15')['value'])->toBe(MetricFixture::EXPECTED['average_order_value'])
        ->and($margin->firstWhere('bucket', '2026-08-16')['value'])->toBeNull()
        ->and($aov->firstWhere('bucket', '2026-08-16')['value'])->toBeNull();

    // Margin is cost; staff may not chart it.
    $this->actingAs(User::factory()->staff()->create());
    expect(fn () => app(TimeSeries::class)->build(
        Period::preset('30d'), 'gross_margin', 'day', User::query()->latest('id')->first(),
    ))->toThrow(HttpException::class);
});
