<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\Period;
use App\Domain\Metrics\TimeSeries;
use App\Models\BusinessSetting;
use App\Models\Order;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Carbon;

/*
|--------------------------------------------------------------------------
| Buckets across a daylight-saving change
|--------------------------------------------------------------------------
|
| The series used to be grouped in SQL with ONE offset — the offset in force on
| the day the report was run — applied to the whole history. Every Gulf zone is
| fixed, so it was invisible here; anywhere that changes its clocks it was not.
|
| And the failure was not a mislabelled bucket. `emptyBuckets()` builds the PHP
| keys with the real named zone, so a shifted SQL key matched no PHP key at all
| and the row fell through `?? zeroFor()` — silently, and only for orders near
| local midnight. A day's trade reported as zero.
|
| These tests are written against Europe/Berlin because it is the cheapest zone
| to reason about: CEST (+02:00) until 03:00 on Sunday 25 October 2026, CET
| (+01:00) after. They fail on the previous implementation.
|
*/

/** Point the business at a timezone, and clear the per-business cache. */
function inTimezone(string $zone): void
{
    BusinessSetting::current()->forceFill(['timezone' => $zone])->save();
    BusinessSetting::flushCache();
}

/** A fulfilled sale at a wall-clock time in the business's own zone. */
function sellAtLocal(string $localDateTime, string $amount): void
{
    Order::factory()->create([
        'status' => 'confirmed',
        'placed_at' => Carbon::parse($localDateTime, BusinessSetting::current()->timezone)->utc(),
        'subtotal_amount' => $amount,
        'total_amount' => $amount,
    ]);
}

/** @return array<string, string> bucket date => value */
function dailyRevenue(string $from, string $to): array
{
    $series = app(TimeSeries::class)->build(
        Period::between($from, $to),
        'net_revenue',
        'day',
        User::factory()->role(Role::Owner)->create(),
    );

    return array_combine(array_column($series, 'bucket'), array_column($series, 'value'));
}

it('keeps an order on the local day it was placed after the clocks go back', function (): void {
    inTimezone('Europe/Berlin');

    /*
     * Three sales at half past eleven at night — the hour the old offset moved
     * across midnight. The first is still CEST, the other two are CET, and the
     * report is run in CEST, so the single offset is an hour too large for
     * everything after the 25th.
     */
    sellAtLocal('2026-10-23 23:30:00', '100.000');
    sellAtLocal('2026-10-27 23:30:00', '200.000');
    sellAtLocal('2026-10-31 23:30:00', '400.000');

    $buckets = dailyRevenue('2026-10-20', '2026-10-31');

    expect($buckets['2026-10-23'])->toBe('100.000')
        ->and($buckets['2026-10-27'])->toBe('200.000')
        // Not the 28th: that is where an hour of drift used to put it.
        ->and($buckets['2026-10-28'])->toBe('0.000')
        // And the last day of the period, whose drifted key was 1 November —
        // a bucket that does not exist, so the money simply vanished.
        ->and($buckets['2026-10-31'])->toBe('400.000');
});

it('still sums to the period total across the change', function (): void {
    inTimezone('Europe/Berlin');

    sellAtLocal('2026-10-23 23:30:00', '100.000');
    sellAtLocal('2026-10-27 23:30:00', '200.000');
    sellAtLocal('2026-10-31 23:30:00', '400.000');
    sellAtLocal('2026-10-26 09:00:00', '50.000');

    $period = Period::between('2026-10-20', '2026-10-31');
    $summed = array_reduce(
        array_values(dailyRevenue('2026-10-20', '2026-10-31')),
        fn (string $carry, string $value): string => bcadd($carry, $value, Money::scale()),
        Money::zero(),
    );

    expect($summed)->toBe(
        app(MetricCalculator::class)->netRevenue($period),
        'The buckets and the period metric disagree, so one of them is losing rows.',
    );
});

it('reads midnight the same way as the period boundary does', function (): void {
    inTimezone('Europe/Berlin');

    // Either side of local midnight on the night the clocks change.
    sellAtLocal('2026-10-24 23:59:00', '10.000');
    sellAtLocal('2026-10-25 00:01:00', '20.000');
    sellAtLocal('2026-10-25 23:59:00', '30.000');
    sellAtLocal('2026-10-26 00:01:00', '40.000');

    $buckets = dailyRevenue('2026-10-24', '2026-10-26');

    expect($buckets['2026-10-24'])->toBe('10.000')
        ->and($buckets['2026-10-25'])->toBe('50.000')
        ->and($buckets['2026-10-26'])->toBe('40.000');
});

it('leaves a business whose clocks never change exactly as it was', function (): void {
    $timezone = BusinessSetting::current()->timezone;

    expect($timezone)->not->toBe('UTC', 'This test is only meaningful in a non-UTC business timezone.');

    sellAtLocal('2026-10-24 23:30:00', '100.000');
    sellAtLocal('2026-10-25 00:30:00', '200.000');

    $buckets = dailyRevenue('2026-10-24', '2026-10-25');

    expect($buckets['2026-10-24'])->toBe('100.000')
        ->and($buckets['2026-10-25'])->toBe('200.000');
});

it('buckets weekly and monthly from the same edges', function (): void {
    inTimezone('Europe/Berlin');

    sellAtLocal('2026-10-27 23:30:00', '200.000');
    sellAtLocal('2026-10-31 23:30:00', '400.000');

    $monthly = app(TimeSeries::class)->build(
        Period::between('2026-09-01', '2026-11-30'),
        'net_revenue',
        'month',
        User::factory()->role(Role::Owner)->create(),
    );

    $october = collect($monthly)->firstWhere('bucket', '2026-10-01');

    // Both sales are October's, including the one an hour of drift used to
    // push into November.
    expect($october['value'])->toBe('600.000');
});
