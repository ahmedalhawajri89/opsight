<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Metrics\Period;
use App\Models\ActivityLog;
use App\Models\BusinessSetting;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Business settings
|--------------------------------------------------------------------------
|
| Configuration an Owner edits at runtime. Two of these fields are inputs to
| every period boundary in the system, which makes this the one settings screen
| where a careless save changes what the last three years reported.
|
*/

it('lets an Owner read the settings', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->getJson('/api/v1/settings')
        ->assertOk()
        ->assertJsonPath('data.currency', 'BHD')
        ->assertJsonPath('meta.editable', true);
});

it('refuses the read to every role without settings.view', function (string $role): void {
    /*
     * Default deny, even for values that are arguably not secret.
     *
     * The tempting argument is that currency and timezone are formatting
     * inputs every screen needs. They are — and every screen that formats
     * money already receives them in the META of the analytics response it
     * was making anyway, so nothing outside this screen needs this endpoint.
     * Widening a route on a justification the code does not actually rely on
     * is how default-deny erodes (SECURITY.md §2.1).
     */
    $user = User::factory()->role(Role::from($role))->create();

    $this->actingAs($user)->getJson('/api/v1/settings')->assertForbidden();
})->with(['manager', 'analyst', 'staff']);

it('names the fields that move historical figures', function (): void {
    /*
     * Changing the timezone or the fiscal year start does not alter a single
     * record — it alters which PERIOD every past record falls into, so every
     * month-end total shifts. The server names those fields rather than
     * leaving the UI to hardcode a warning that would go stale.
     */
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->getJson('/api/v1/settings')
        ->assertJsonPath('meta.affects_history', ['timezone', 'fiscal_year_start_month', 'week_starts_on']);
});

it('refuses a write from every role but Owner', function (string $role): void {
    $user = User::factory()->role(Role::from($role))->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/settings', ['company_name' => 'Hijacked Ltd'])
        ->assertForbidden();

    expect(BusinessSetting::current()->company_name)->not->toBe('Hijacked Ltd');
})->with(['manager', 'analyst', 'staff']);

it('saves a change made by an Owner', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->patchJson('/api/v1/settings', [
        'company_name' => 'Opsight Trading WLL',
        'default_low_stock_threshold' => 15,
    ])->assertOk()->assertJsonPath('data.company_name', 'Opsight Trading WLL');

    BusinessSetting::flushCache();

    expect(BusinessSetting::current()->default_low_stock_threshold)->toBe(15);
});

it('rejects a timezone that is not a real IANA identifier', function (): void {
    // The timezone drives every period boundary. A typo accepted here would
    // silently move figures rather than fail loudly.
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['timezone' => 'Asia/Atlantis'])
        ->assertStatus(422)
        ->assertJsonValidationErrors('timezone');
});

it('rejects a fiscal year start outside the twelve months', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['fiscal_year_start_month' => 13])
        ->assertStatus(422);
});

it('takes effect on period resolution within the same request cycle', function (): void {
    /*
     * The singleton is memoised per process. If the memo survived the write,
     * every period resolved after it would still use the old fiscal year —
     * the kind of inconsistency that appears once and never reproduces.
     */
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['fiscal_year_start_month' => 7])
        ->assertOk();

    BusinessSetting::flushCache();

    expect(BusinessSetting::current()->fiscal_year_start_month)->toBe(7);

    // A July fiscal year means YTD starts in July, not January.
    $ytd = Period::preset('ytd');

    expect(substr($ytd->from, 5, 2))->toBe('07');
});

it('audits a settings change under its own action', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['company_name' => 'Renamed Co'])
        ->assertOk();

    $log = ActivityLog::query()->where('action', 'settings.updated')->latest('id')->first();

    expect($log)->not->toBeNull()
        ->and($log->changes['after']['company_name'])->toBe('Renamed Co')
        ->and($log->user_id)->toBe($owner->id);
});

it('serves the fixed expense category vocabulary to a role that may see expenses', function (): void {
    $manager = User::factory()->role(Role::Manager)->create();
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($manager)->getJson('/api/v1/settings/expense-categories')->assertOk();

    // Staff hold no expense ability at all — the module is unreachable, not
    // merely hidden.
    $this->actingAs($staff)->getJson('/api/v1/settings/expense-categories')->assertForbidden();
});
