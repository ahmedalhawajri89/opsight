<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Carbon;

/*
|--------------------------------------------------------------------------
| Ramadan against Ramadan
|--------------------------------------------------------------------------
|
| March 2026 against March 2025 is the case that motivated this: March 2025
| was all Ramadan, March 2026 held nineteen days of it and then Eid. Compared
| by Gregorian date, a normal Ramadan reads as a collapse or a surge.
|
*/

function ramadanOrder(string $placedOn, string $netAmount): void
{
    Order::factory()->create([
        'status' => 'confirmed',
        'placed_at' => Carbon::parse($placedOn.' 12:00:00', 'Asia/Bahrain')->utc(),
        'subtotal_amount' => $netAmount,
        'total_amount' => $netAmount,
    ]);
}

it('compares with the same Hijri dates a Hijri year earlier', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->getJson('/api/v1/analytics/summary?preset=custom&from=2026-02-18&to=2026-03-19&comparison=previous_hijri_year')
        ->assertOk()
        // Ramadan 1447 (30 days) against Ramadan 1446, which had 29: the
        // 30th has no twin, so it lands on the 29th — the whole of last
        // Ramadan, and not a day of the Eid that followed it on the 30th.
        ->assertJsonPath('meta.comparison.from', '2025-03-01')
        ->assertJsonPath('meta.comparison.to', '2025-03-29')
        ->assertJsonPath('meta.comparison.basis', 'previous_hijri_year')
        ->assertJsonPath('meta.comparison.label', 'vs the same Hijri dates last year')
        ->assertJsonPath('meta.comparison.season_mismatch', false);
});

it('computes the change against last Ramadan, not last March', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    ramadanOrder('2026-02-25', '1200.000'); // Ramadan 1447
    ramadanOrder('2025-03-10', '1000.000'); // Ramadan 1446
    ramadanOrder('2025-02-25', '300.000');  // last February: ordinary trade

    $this->actingAs($owner)
        ->getJson('/api/v1/analytics/summary?preset=custom&from=2026-02-18&to=2026-03-19&comparison=previous_hijri_year')
        ->assertOk()
        ->assertJsonPath('data.net_revenue.value', '1200.000')
        ->assertJsonPath('data.net_revenue.previous', '1000.000');
});

it('flags a Gregorian comparison that sets unlike seasons against each other', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $response = $this->actingAs($owner)
        ->getJson('/api/v1/analytics/summary?preset=custom&from=2026-03-01&to=2026-03-31&comparison=previous_year')
        ->assertOk()
        ->assertJsonPath('meta.comparison.season_mismatch', true);

    expect(collect($response->json('meta.seasons'))->pluck('key')->all())->toBe(['ramadan', 'eid_al_fitr'])
        ->and(collect($response->json('meta.comparison.seasons'))->pluck('key')->all())->toBe(['ramadan', 'eid_al_fitr']);
});

it('does not flag ordinary trade', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->getJson('/api/v1/analytics/summary?preset=custom&from=2026-08-01&to=2026-08-31&comparison=previous_year')
        ->assertOk()
        ->assertJsonPath('meta.comparison.season_mismatch', false)
        ->assertJsonPath('meta.seasons', []);
});

it('describes the Hijri basis in Arabic', function (): void {
    $owner = User::factory()->role(Role::Owner)->create(['locale' => 'ar']);

    $this->actingAs($owner)
        ->getJson('/api/v1/analytics/summary?preset=custom&from=2026-02-18&to=2026-03-19&comparison=previous_hijri_year')
        ->assertOk()
        ->assertJsonPath('meta.comparison.label', 'مقارنة بالموسم الهجري نفسه من العام الماضي');
});
