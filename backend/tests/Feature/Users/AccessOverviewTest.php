<?php

declare(strict_types=1);

use App\Authorization\AbilityRegistry;
use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Access at a glance: the roles, who holds them, and the log's pulse
|--------------------------------------------------------------------------
*/

it('lists each role with what the server lets it do', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $roles = collect($this->actingAs($owner)->getJson('/api/v1/roles')->assertOk()->json('data.roles'))->keyBy('role');

    // From the registry itself: the access table cannot disagree with it.
    expect($roles['analyst']['abilities'])->toBe(AbilityRegistry::stringsFor(Role::Analyst))
        ->and($roles['staff']['abilities'])->not->toContain('metrics.view_cost');
});

it('counts who holds each role, and the accounts nobody is using', function (): void {
    $owner = User::factory()->role(Role::Owner)->create(['last_login_at' => now()]);
    User::factory()->role(Role::Staff)->create(['last_login_at' => null]);
    User::factory()->role(Role::Staff)->create(['last_login_at' => now()->subDays(45)]);
    User::factory()->role(Role::Staff)->create(['is_active' => false]);

    $data = $this->actingAs($owner)->getJson('/api/v1/roles')->assertOk()->json('data');
    $staff = collect($data['roles'])->firstWhere('role', 'staff');

    expect($staff['active'])->toBe(2)
        ->and($staff['deactivated'])->toBe(1)
        ->and($data['summary']['never_signed_in'])->toBe(1)
        ->and($data['summary']['dormant'])->toBe(1);
});

it('keeps the roles from anyone who may not see the users', function (): void {
    $this->actingAs(User::factory()->role(Role::Staff)->create())->getJson('/api/v1/roles')->assertForbidden();
});

it('sums up the log: today, the people at work, and failed sign-ins', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    ActivityLog::query()->forceCreate(['action' => 'auth.login', 'user_id' => $owner->id, 'business_id' => $owner->business_id]);
    ActivityLog::query()->forceCreate(['action' => 'auth.login_failed', 'user_id' => null, 'business_id' => $owner->business_id]);

    $data = $this->actingAs($owner)->getJson('/api/v1/activity/summary')->assertOk()->json('data');

    expect($data['today'])->toBeGreaterThanOrEqual(2)
        ->and($data['people_today'])->toBeGreaterThanOrEqual(1)
        ->and($data['failed_sign_ins_week'])->toBe(1)
        ->and($data['daily'])->toHaveCount(14);
});

it('narrows the log to one area of the business, and an unknown area to nothing', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    ActivityLog::query()->forceCreate(['action' => 'auth.login_failed', 'business_id' => $owner->business_id]);
    ActivityLog::query()->forceCreate(['action' => 'order.confirmed', 'business_id' => $owner->business_id]);

    $security = collect($this->actingAs($owner)->getJson('/api/v1/activity?filter[category]=security')->assertOk()->json('data'))->pluck('action');

    expect($security)->toContain('auth.login_failed')
        ->and($security)->not->toContain('order.confirmed');

    $this->actingAs($owner)->getJson('/api/v1/activity?filter[category]=nonsense')->assertOk()->assertJsonCount(0, 'data');
});
