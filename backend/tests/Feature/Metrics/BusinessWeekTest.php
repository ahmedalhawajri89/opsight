<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\BusinessSetting;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Carbon;

/*
|--------------------------------------------------------------------------
| The business week (ADR-020)
|--------------------------------------------------------------------------
|
| Weekly buckets begin on the day the business says its week begins, and
| the SQL grouping agrees with the PHP bucket keys — the disagreement that
| once zeroed every weekly figure under Arabic must not come back through a
| different door.
|
*/

function weekOrder(string $placedOn, string $amount): void
{
    Order::factory()->create([
        'status' => 'confirmed',
        'placed_at' => Carbon::parse($placedOn.' 12:00:00', 'Asia/Bahrain')->utc(),
        'subtotal_amount' => $amount,
        'total_amount' => $amount,
    ]);
}

function weekStartsOn(int $isoDay): void
{
    BusinessSetting::current()->forceFill(['week_starts_on' => $isoDay])->save();
    BusinessSetting::flushCache();
}

it('starts weekly buckets on Sunday when the business week does', function (): void {
    weekStartsOn(7);
    $owner = User::factory()->role(Role::Owner)->create();

    // Sunday 2 Aug 2026 and Saturday 8 Aug are the same Sunday-week;
    // Sunday 9 Aug starts the next one.
    weekOrder('2026-08-02', '100.000');
    weekOrder('2026-08-08', '50.000');
    weekOrder('2026-08-09', '25.000');

    $series = $this->actingAs($owner)
        ->getJson('/api/v1/analytics/timeseries?metric=net_revenue&grain=week&preset=custom&from=2026-08-02&to=2026-08-15')
        ->assertOk()
        ->json('data');

    expect(array_column($series, 'bucket'))->toBe(['2026-08-02', '2026-08-09'])
        ->and($series[0]['bucket_end'])->toBe('2026-08-08')
        ->and($series[0]['value'])->toBe('150.000')
        ->and($series[1]['value'])->toBe('25.000');
});

it('keeps Monday weeks by default, as every weekly figure always has', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $series = $this->actingAs($owner)
        ->getJson('/api/v1/analytics/timeseries?metric=net_revenue&grain=week&preset=custom&from=2026-08-03&to=2026-08-16')
        ->assertOk()
        ->json('data');

    expect(array_column($series, 'bucket'))->toBe(['2026-08-03', '2026-08-10']);
});

it('buckets expenses on the same business week as orders', function (): void {
    weekStartsOn(6); // Saturday
    $owner = User::factory()->role(Role::Owner)->create();

    $series = $this->actingAs($owner)
        ->getJson('/api/v1/analytics/timeseries?metric=operating_expenses&grain=week&preset=custom&from=2026-08-01&to=2026-08-14')
        ->assertOk()
        ->json('data');

    expect($series[0]['bucket'])->toBe('2026-08-01'); // a Saturday
});

it('reports the weekend to the screens, Friday and Saturday by default', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->getJson('/api/v1/analytics/summary?preset=7d')
        ->assertOk()
        ->assertJsonPath('meta.weekend_days', [5, 6])
        ->assertJsonPath('meta.week_starts_on', 1);
});

it('lets an owner set the week and stores the weekend as sorted integers', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['week_starts_on' => 7, 'weekend_days' => ['6', 5]])
        ->assertOk()
        ->assertJsonPath('data.week_starts_on', 7)
        ->assertJsonPath('data.weekend_days', [5, 6]);

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['week_starts_on' => 8])
        ->assertStatus(422);

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['weekend_days' => [1, 2, 3, 4, 5, 6, 7]])
        ->assertStatus(422);
});
