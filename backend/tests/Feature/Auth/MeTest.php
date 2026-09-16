<?php

declare(strict_types=1);

use App\Authorization\Ability;
use App\Authorization\AbilityRegistry;
use App\Authorization\Role;
use App\Models\User;

it('returns the authenticated user with resolved abilities', function (): void {
    $user = User::factory()->owner()->create([
        'name' => 'Ahmed Al Hawajri',
        'email' => 'owner@opsight.test',
    ]);

    $this->actingAs($user)
        ->getJson('/api/v1/me')
        ->assertOk()
        ->assertJsonPath('data.id', $user->id)
        ->assertJsonPath('data.name', 'Ahmed Al Hawajri')
        ->assertJsonPath('data.email', 'owner@opsight.test')
        ->assertJsonPath('data.role', 'owner')
        ->assertJsonPath('data.role_label', 'Owner')
        ->assertJsonPath('data.is_active', true)
        ->assertJsonPath('data.abilities', AbilityRegistry::stringsFor(Role::Owner));
});

it('rejects an unauthenticated request', function (): void {
    $this->getJson('/api/v1/me')
        ->assertUnauthorized()
        ->assertJsonPath('code', 'auth.unauthenticated');
});

it('never exposes the password hash or remember token', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->getJson('/api/v1/me')
        ->assertOk()
        ->assertJsonMissingPath('data.password')
        ->assertJsonMissingPath('data.remember_token');
});

/*
|--------------------------------------------------------------------------
| Mid-session deactivation
|--------------------------------------------------------------------------
|
| MVP_SCOPE.md §6.1: revoking access takes effect on the user's NEXT request,
| not at their next login. Without this, an 8-hour session means "some time
| today" (SECURITY.md §3).
|
*/

it('rejects a live session whose user was deactivated', function (): void {
    User::factory()->manager()->create(['email' => 'revoked@opsight.test']);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'revoked@opsight.test',
        'password' => 'password',
    ])->assertOk();

    $this->asNewRequest()->getJson('/api/v1/me')->assertOk();

    // An Owner deactivates them while they are still logged in.
    User::where('email', 'revoked@opsight.test')->update(['is_active' => false]);

    // Their very next request is refused — not their next login.
    $this->asNewRequest()
        ->getJson('/api/v1/me')
        ->assertUnauthorized()
        ->assertJsonPath('code', 'auth.account_deactivated');
});

/*
|--------------------------------------------------------------------------
| The frontend's only permission source
|--------------------------------------------------------------------------
*/

it('gives staff an ability list free of every cost-bearing ability', function (): void {
    $staff = User::factory()->staff()->create();

    $abilities = $this->actingAs($staff)
        ->getJson('/api/v1/me')
        ->assertOk()
        ->json('data.abilities');

    expect($abilities)
        ->not->toContain('metrics.view_cost')
        ->not->toContain('products.view_cost')
        ->not->toContain('orders.view_margin')
        ->not->toContain('customers.view_ltv')
        ->not->toContain('expenses.view')
        ->not->toContain('analytics.view');
});

it('matches the gate for every ability it reports', function (Role $role): void {
    $user = User::factory()->role($role)->create();

    $reported = $this->actingAs($user)->getJson('/api/v1/me')->json('data.abilities');

    // What /me advertises and what the Gate actually enforces must agree.
    // If they ever diverge, the frontend shows a button that 403s.
    foreach ($reported as $ability) {
        expect($user->can($ability))
            ->toBeTrue("Gate denies {$ability} but /me advertises it for {$role->value}");
    }

    $notReported = array_diff(Ability::values(), $reported);

    foreach ($notReported as $ability) {
        expect($user->can($ability))
            ->toBeFalse("Gate allows {$ability} but /me withholds it for {$role->value}");
    }
})->with(Role::cases());
