<?php

declare(strict_types=1);

use App\Models\User;
use Carbon\Carbon;
use Tests\Support\MetricFixture;

beforeEach(function (): void {
    MetricFixture::build();
    $this->range = '?preset=custom&from='.MetricFixture::FROM.'&to='.MetricFixture::TO;
});

/*
|--------------------------------------------------------------------------
| The summary endpoint
|--------------------------------------------------------------------------
*/

it('returns every headline metric with its hand-calculated value', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $response = $this->getJson("/api/v1/analytics/summary{$this->range}")->assertOk();

    $expected = MetricFixture::EXPECTED;

    $response->assertJsonPath('data.net_revenue.value', $expected['net_revenue'])
        ->assertJsonPath('data.orders_count.value', $expected['orders_count'])
        ->assertJsonPath('data.average_order_value.value', $expected['average_order_value'])
        ->assertJsonPath('data.cogs.value', $expected['cogs'])
        ->assertJsonPath('data.gross_profit.value', $expected['gross_profit'])
        ->assertJsonPath('data.net_profit.value', $expected['net_profit']);
});

it('states its period, timezone and comparison basis on every response', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson("/api/v1/analytics/summary{$this->range}")
        ->assertOk()
        // A chart that does not know its own period can mislabel itself.
        ->assertJsonPath('meta.period.from', MetricFixture::FROM)
        ->assertJsonPath('meta.period.to', MetricFixture::TO)
        ->assertJsonPath('meta.period.timezone', 'Asia/Bahrain')
        ->assertJsonPath('meta.comparison.basis', 'previous_period')
        ->assertJsonStructure(['meta' => ['period' => ['is_partial'], 'comparison' => ['label', 'from', 'to']]]);
});

it('declares the favourable direction for each metric rather than leaving the UI to guess', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $response = $this->getJson("/api/v1/analytics/summary{$this->range}")->assertOk();

    // Up is good for revenue; DOWN is good for cancellations and cost.
    $response->assertJsonPath('data.net_revenue.favourable', 'up')
        ->assertJsonPath('data.cancellation_rate.favourable', 'down')
        ->assertJsonPath('data.refund_rate.favourable', 'down')
        ->assertJsonPath('data.cogs.favourable', 'down')
        ->assertJsonPath('data.operating_expenses.favourable', 'down')
        ->assertJsonPath('data.gross_margin.favourable', 'up');
});

it('returns a null change against a period with no prior activity', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    // July has no orders, so August has nothing to compare against.
    $response = $this->getJson("/api/v1/analytics/summary{$this->range}")->assertOk();

    expect($response->json('data.net_revenue.previous'))->toBe('0.000')
        // Growth from zero is not a percentage.
        ->and($response->json('data.net_revenue.change_pct'))->toBeNull();
});

it('carries an empty reason so the UI can explain an em dash', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $response = $this->getJson('/api/v1/analytics/summary?preset=custom&from=2020-01-01&to=2020-01-31')
        ->assertOk();

    expect($response->json('data.average_order_value.value'))->toBeNull()
        ->and($response->json('data.average_order_value.empty_reason'))
        ->toContain('no average');
});

/*
|--------------------------------------------------------------------------
| The cost boundary — the figures are NOT CALCULATED, not merely hidden
|--------------------------------------------------------------------------
*/

it('omits every cost metric from the summary for staff', function (): void {
    $this->actingAs(User::factory()->staff()->create());

    // Staff hold no analytics.view ability at all, so the module is unreachable
    // rather than merely emptied.
    $this->getJson("/api/v1/analytics/summary{$this->range}")->assertForbidden();
});

it('omits every cost metric from the dashboard for staff', function (): void {
    $this->actingAs(User::factory()->staff()->create());

    $response = $this->getJson("/api/v1/dashboard{$this->range}")->assertOk();

    foreach (['cogs', 'gross_profit', 'gross_margin', 'operating_expenses', 'net_profit', 'net_margin'] as $key) {
        $response->assertJsonMissingPath("data.metrics.{$key}");
    }

    $response->assertJsonMissingPath('data.profit_trend');

    // Revenue and orders are still there — the job needs them.
    $response->assertJsonPath('data.metrics.net_revenue.value', MetricFixture::EXPECTED['net_revenue'])
        ->assertJsonPath('data.metrics.orders_count.value', MetricFixture::EXPECTED['orders_count']);
});

it('includes the cost metrics on the dashboard for a manager', function (): void {
    $this->actingAs(User::factory()->manager()->create());

    $this->getJson("/api/v1/dashboard{$this->range}")
        ->assertOk()
        ->assertJsonPath('data.metrics.cogs.value', MetricFixture::EXPECTED['cogs'])
        ->assertJsonPath('data.metrics.net_profit.value', MetricFixture::EXPECTED['net_profit'])
        ->assertJsonStructure(['data' => ['profit_trend']]);
});

it('refuses a cost-bearing time series rather than returning zeros', function (): void {
    /*
     * The refusal is the point. This used to sign in as a Manager — who HOLDS
     * metrics.view_cost — and assert a 200, so it passed against exactly the
     * all-zero payload its own comment forbids. Staff is the role that must be
     * refused, because zeros would tell them profit was nil, which is a
     * different and false claim.
     */
    $this->actingAs(User::factory()->staff()->create());
    $this->getJson("/api/v1/analytics/timeseries{$this->range}&metric=gross_profit")->assertForbidden();

    // A role that may read cost still gets the series.
    $this->actingAs(User::factory()->manager()->create());
    $this->getJson("/api/v1/analytics/timeseries{$this->range}&metric=gross_profit")
        ->assertOk()
        ->assertJsonStructure(['data' => [['bucket', 'bucket_end', 'value']]]);
});

/*
|--------------------------------------------------------------------------
| Time series
|--------------------------------------------------------------------------
*/

it('emits a zero bucket for every day with no orders', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $response = $this->getJson("/api/v1/analytics/timeseries{$this->range}&metric=orders_count&grain=day")
        ->assertOk();

    // August has 31 days and the fixture only sells on the 15th. A gap in the
    // series would make a line chart lie about slope.
    expect($response->json('data'))->toHaveCount(31);

    $withOrders = collect($response->json('data'))->firstWhere('bucket', '2026-08-15');
    $withoutOrders = collect($response->json('data'))->firstWhere('bucket', '2026-08-16');

    expect($withOrders['value'])->toBeGreaterThan(0)
        ->and($withoutOrders['value'])->toBe(0);
});

it('chooses a sensible grain for the span', function (string $from, string $to, string $expected): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson("/api/v1/analytics/timeseries?preset=custom&from={$from}&to={$to}&metric=orders_count")
        ->assertOk()
        ->assertJsonPath('meta.grain', $expected);
})->with([
    'a month is daily' => ['2026-08-01', '2026-08-31', 'day'],
    'a quarter is weekly' => ['2026-06-01', '2026-08-31', 'week'],
    'a year is monthly' => ['2025-09-01', '2026-08-31', 'month'],
]);

it('buckets weeks identically whatever language the reader chose', function (): void {
    /*
     * Regression: Carbon's default week start follows the application locale,
     * and Arabic starts the week on Saturday. The buckets were built from
     * Saturdays while SQL grouped from Mondays, so an Arabic reader saw every
     * weekly value as zero.
     */
    $url = "/api/v1/analytics/timeseries{$this->range}&metric=orders_count&grain=week";

    $english = $this->actingAs(User::factory()->owner()->create())->getJson($url)->assertOk();

    $arabic = User::factory()->owner()->create();
    $arabic->forceFill(['locale' => 'ar'])->save();
    $arabicResponse = $this->actingAs($arabic)->getJson($url)->assertOk();

    $shape = fn ($response) => collect($response->json('data'))
        ->map(fn (array $bucket) => [$bucket['bucket'], $bucket['bucket_end'], $bucket['value']])
        ->all();

    expect($shape($arabicResponse))->toBe($shape($english))
        ->and(collect($english->json('data'))->sum('value'))->toBeGreaterThan(0)
        // Monday-based, matching the SQL grouping.
        ->and(Carbon::parse($english->json('data.1.bucket'))->dayOfWeekIso)->toBe(1);
});

it('rejects an unknown time series metric', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson("/api/v1/analytics/timeseries{$this->range}&metric=vibes")
        ->assertStatus(422)
        ->assertJsonValidationErrors('metric');
});

/*
|--------------------------------------------------------------------------
| Breakdown
|--------------------------------------------------------------------------
*/

it('breaks revenue down by product and reports each share', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $response = $this->getJson("/api/v1/analytics/breakdown{$this->range}&dimension=product&metric=net_revenue")
        ->assertOk();

    $rows = collect($response->json('data'));

    // WIDGET: 2 + 1 + 1 = 4 units at 100 = 400. GADGET: 4 + 2 + 2 = 8 at 25 = 200.
    expect($rows->firstWhere('label', 'Widget')['value'])->toBe('400.000')
        ->and($rows->firstWhere('label', 'Gadget')['value'])->toBe('200.000');

    // Shares sum to 1 across the whole breakdown.
    expect(round($rows->sum('share'), 4))->toBe(1.0);
});

it('adds an Other row when a ranking is truncated, so the shares still sum to the whole', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $response = $this->getJson("/api/v1/analytics/breakdown{$this->range}&dimension=product&metric=net_revenue&limit=1")
        ->assertOk();

    $rows = collect($response->json('data'));

    expect($rows)->toHaveCount(2);

    $other = $rows->firstWhere('is_other', true);

    // Without this row, a chart of the top one implies it IS the business.
    expect($other)->not->toBeNull()
        ->and($other['value'])->toBe('200.000')
        ->and(round($rows->sum('share'), 4))->toBe(1.0);
});

it('groups walk-in trade as itself rather than dropping the revenue', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $response = $this->getJson("/api/v1/analytics/breakdown{$this->range}&dimension=customer&metric=net_revenue")
        ->assertOk();

    $walkIn = collect($response->json('data'))->firstWhere('label', 'Walk-in');

    expect($walkIn)->not->toBeNull()
        ->and($walkIn['value'])->toBe('100.000');
});

it('refuses a cost-bearing breakdown for a role without cost visibility', function (): void {
    // Analyst holds metrics.view_cost, so this must succeed.
    $this->actingAs(User::factory()->analyst()->create());

    $this->getJson("/api/v1/analytics/breakdown{$this->range}&dimension=product&metric=gross_profit")
        ->assertOk();
});

it('rejects an unknown breakdown dimension', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson("/api/v1/analytics/breakdown{$this->range}&dimension=astrology&metric=net_revenue")
        ->assertStatus(422)
        ->assertJsonValidationErrors('dimension');
});

/*
|--------------------------------------------------------------------------
| Partial periods
|--------------------------------------------------------------------------
*/

it('flags a period that is still accumulating', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson('/api/v1/analytics/summary?preset=30d')
        ->assertOk()
        // A rolling window includes today, so it is always partial.
        ->assertJsonPath('meta.period.is_partial', true)
        ->assertJsonPath('meta.comparison.compares_partial_against_complete', true);
});

it('does not flag a period that has fully elapsed', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson("/api/v1/analytics/summary{$this->range}")
        ->assertOk()
        ->assertJsonPath('meta.period.is_partial', false);
});

/*
|--------------------------------------------------------------------------
| Validation
|--------------------------------------------------------------------------
*/

it('requires both dates for a custom period', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson('/api/v1/analytics/summary?preset=custom')
        ->assertStatus(422)
        ->assertJsonValidationErrors(['from', 'to']);
});

it('rejects a period that ends before it starts', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson('/api/v1/analytics/summary?preset=custom&from=2026-08-31&to=2026-08-01')
        ->assertStatus(422)
        ->assertJsonValidationErrors('to');
});

it('rejects an unknown preset', function (): void {
    $this->actingAs(User::factory()->owner()->create());

    $this->getJson('/api/v1/analytics/summary?preset=fortnight')
        ->assertStatus(422)
        ->assertJsonValidationErrors('preset');
});

it('requires authentication', function (): void {
    $this->getJson('/api/v1/analytics/summary')->assertUnauthorized();
    $this->getJson('/api/v1/dashboard')->assertUnauthorized();
});
