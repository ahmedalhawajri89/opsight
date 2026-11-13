<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\BusinessSetting;
use App\Models\Order;
use App\Models\User;
use App\Support\Money;
use Tests\Support\MetricFixture;

/*
|--------------------------------------------------------------------------
| The dashboard's own figures (redesign, 2026-11-13)
|--------------------------------------------------------------------------
|
| Sales by channel, expenses by category, net profit per day, the best day
| and the average day. Each is held to the period figure MetricCalculator
| reports, so none can become a second definition of revenue or profit.
|
*/

function figuresRange(): string
{
    return '?preset=custom&from='.MetricFixture::FROM.'&to='.MetricFixture::TO;
}

/** @param  list<array<string, mixed>>  $rows */
function sumOf(array $rows, string $key): string
{
    return array_reduce($rows, fn (string $c, array $r): string => bcadd($c, (string) $r[$key], Money::scale()), '0');
}

it('splits the period sales by channel, summing to net revenue', function (): void {
    MetricFixture::build();
    // One qualifying order from each connected store; the rest stay manual.
    $orders = Order::query()->whereNotNull('placed_at')->orderBy('id')->get();
    $orders[0]->forceFill(['source' => 'salla', 'external_id' => 's-1'])->save();
    $orders[1]->forceFill(['source' => 'zid', 'external_id' => 'z-1'])->save();

    $channels = $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard'.figuresRange())
        ->assertOk()
        ->json('data.channels');

    $keys = array_column($channels, 'key');

    expect(sumOf($channels, 'revenue'))->toBe(MetricFixture::EXPECTED['net_revenue'])
        ->and($keys)->toContain('manual')
        ->and(array_sum(array_column($channels, 'share')))->toEqualWithDelta(1.0, 0.0001)
        ->and($channels[0])->toHaveKeys(['orders', 'revenue', 'share', 'gross_margin', 'last_order_at']);
});

it('hides channel margins from a role that cannot see cost', function (): void {
    MetricFixture::build();

    $channels = $this->actingAs(User::factory()->staff()->create())
        ->getJson('/api/v1/dashboard'.figuresRange())
        ->assertOk()
        ->json('data.channels');

    expect($channels)->not->toBeEmpty();

    foreach ($channels as $channel) {
        expect($channel)->not->toHaveKey('gross_margin');
    }
});

it('gives net profit per day, summing to the period net profit', function (): void {
    MetricFixture::build();

    $response = $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard'.figuresRange())
        ->assertOk();

    expect(sumOf($response->json('data.net_profit_trend'), 'value'))->toBe(MetricFixture::EXPECTED['net_profit'])
        ->and($response->json('data.expenses_by_category.total'))->toBe(MetricFixture::EXPECTED['operating_expenses'])
        ->and(sumOf($response->json('data.expenses_by_category.rows'), 'value'))->toBe(MetricFixture::EXPECTED['operating_expenses']);
});

it('names the best day and the average day', function (): void {
    MetricFixture::build();

    $data = $this->actingAs(User::factory()->staff()->create())
        ->getJson('/api/v1/dashboard'.figuresRange())
        ->assertOk()
        ->json('data');

    $best = collect($data['revenue_trend'])->max(fn (array $p): float => (float) $p['value']);

    expect((float) $data['peak']['value'])->toBe((float) $best)
        // 540 over the 31 days of August.
        ->and($data['daily_average'])->toBe(Money::round(bcdiv('540', '31', 6)));
});

it('sends no peak for a period with no sales', function (): void {
    $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/dashboard')
        ->assertOk()
        ->assertJsonPath('data.peak', null)
        ->assertJsonPath('data.channels', []);
});

it('keeps net profit and expense categories from a role that cannot see cost', function (): void {
    $staff = $this->actingAs(User::factory()->staff()->create())->getJson('/api/v1/dashboard')->assertOk();

    $staff->assertJsonMissingPath('data.net_profit_trend')
        ->assertJsonMissingPath('data.expenses_by_category');
});

it('marks the weeks the forecast falls below the cash floor', function (): void {
    BusinessSetting::current()->forceFill([
        'cash_balance' => '1000',
        'cash_balance_as_of' => now()->toDateString(),
        'cash_safety_threshold' => '5000',
    ])->save();

    $forecast = $this->actingAs(User::factory()->owner()->create())
        ->getJson('/api/v1/forecasts/cash')
        ->assertOk()
        ->json('data');

    // Nothing flows in or out, so every week sits at 1,000, under the floor.
    expect($forecast['safety_threshold'])->toBe('5000.000')
        ->and($forecast['below_threshold_weeks'])->toHaveCount(13);
});

it('lets the owner set and clear the cash floor, with an audit, and nobody else', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->putJson('/api/v1/forecasts/cash/threshold', ['amount' => '8000'])
        ->assertOk()
        ->assertJsonPath('data.cash_safety_threshold', '8000.000');

    $this->actingAs($owner)->putJson('/api/v1/forecasts/cash/threshold', ['amount' => '-1'])->assertUnprocessable();

    $this->actingAs($owner)->putJson('/api/v1/forecasts/cash/threshold', ['amount' => null])
        ->assertOk()
        ->assertJsonPath('data.cash_safety_threshold', null);

    expect(ActivityLog::query()->where('action', 'forecast.cash_threshold_set')->count())->toBe(2);

    $this->actingAs(User::factory()->role(Role::Analyst)->create())
        ->putJson('/api/v1/forecasts/cash/threshold', ['amount' => '1'])
        ->assertForbidden();
});
