<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| User administration
|--------------------------------------------------------------------------
|
| SECURITY.md §15.15 and §15.6. The rule under test is not a permission — it
| is an availability guarantee. Owner is the only role holding
| `users.change_role` and `settings.update`, so an installation with no active
| Owner cannot promote anyone, cannot change its own settings, and cannot be
| recovered through the application at all.
|
*/

it('refuses to demote the last active Owner', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->postJson("/api/v1/users/{$owner->id}/role", ['role' => 'manager'])
        ->assertStatus(409)
        ->assertJsonPath('code', 'users.last_owner');

    expect($owner->refresh()->role)->toBe(Role::Owner);
});

it('refuses to deactivate the last active Owner', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->postJson("/api/v1/users/{$owner->id}/deactivate")
        ->assertStatus(409)
        ->assertJsonPath('code', 'users.last_owner');

    expect($owner->refresh()->is_active)->toBeTrue();
});

it('allows demoting an Owner once a second one exists', function (): void {
    $first = User::factory()->role(Role::Owner)->create();
    $second = User::factory()->role(Role::Owner)->create();

    $this->actingAs($first)
        ->postJson("/api/v1/users/{$second->id}/role", ['role' => 'manager'])
        ->assertOk();

    expect($second->refresh()->role)->toBe(Role::Manager);
});

/*
 * An INACTIVE Owner cannot hold the installation open.
 *
 * They cannot sign in — EnsureUserIsActive rejects them — so counting them as
 * an Owner would leave the system with nobody able to administer it while the
 * guard reported everything as fine. The guard counts ACTIVE owners for that
 * reason, and this is the test that keeps it doing so.
 */
it('does not count a deactivated Owner as cover for demoting the active one', function (): void {
    $active = User::factory()->role(Role::Owner)->create();
    $dormant = User::factory()->role(Role::Owner)->create();
    $dormant->forceFill(['is_active' => false])->save();

    $this->actingAs($active)
        ->postJson("/api/v1/users/{$active->id}/role", ['role' => 'analyst'])
        ->assertStatus(409);

    expect($active->refresh()->role)->toBe(Role::Owner);
});

it('leaves a non-Owner alone, however few of them there are', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $onlyStaff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($owner)
        ->postJson("/api/v1/users/{$onlyStaff->id}/deactivate")
        ->assertOk();

    expect($onlyStaff->refresh()->is_active)->toBeFalse();
});

it('promoting to Owner is never blocked by the guard', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($owner)
        ->postJson("/api/v1/users/{$staff->id}/role", ['role' => 'owner'])
        ->assertOk();

    expect($staff->refresh()->role)->toBe(Role::Owner);
});

/* -------------------------------------------------------------------------- */
/* Mass assignment */
/* -------------------------------------------------------------------------- */

it('ignores a role posted to the ordinary update endpoint', function (): void {
    /*
     * SECURITY.md §15.6. `role` is not fillable and is not in the rule set, so
     * it reaches neither the model nor `validated()`. A privilege escalation
     * must not be able to ride along inside a name change.
     */
    $owner = User::factory()->role(Role::Owner)->create();
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($owner)->patchJson("/api/v1/users/{$staff->id}", [
        'name' => 'Renamed',
        'role' => 'owner',
        'is_active' => false,
    ])->assertOk();

    $staff->refresh();

    expect($staff->name)->toBe('Renamed')
        ->and($staff->role)->toBe(Role::Staff)
        ->and($staff->is_active)->toBeTrue();
});

it('ignores a role posted when creating a user through fill', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    // `role` IS accepted here, because creating a user has to set one — but
    // it goes through forceFill after validation against the Role enum, not
    // through mass assignment.
    $this->actingAs($owner)->postJson('/api/v1/users', [
        'name' => 'New Analyst',
        'email' => 'analyst2@opsight.test',
        'password' => 'a-long-enough-password',
        'password_confirmation' => 'a-long-enough-password',
        'role' => 'analyst',
    ])->assertCreated();

    expect(User::query()->where('email', 'analyst2@opsight.test')->first()->role)
        ->toBe(Role::Analyst);
});

it('rejects a role that is not in the enum', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($owner)
        ->postJson("/api/v1/users/{$staff->id}/role", ['role' => 'superuser'])
        ->assertStatus(422);
});

it('enforces the documented minimum password length', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->postJson('/api/v1/users', [
        'name' => 'Short Password',
        'email' => 'short@opsight.test',
        'password' => 'tooshort',
        'password_confirmation' => 'tooshort',
        'role' => 'staff',
    ])->assertStatus(422)->assertJsonValidationErrors('password');
});

/* -------------------------------------------------------------------------- */
/* Authorization */
/* -------------------------------------------------------------------------- */

it('refuses user administration to every role but Owner', function (string $role): void {
    $actor = User::factory()->role(Role::from($role))->create();
    $target = User::factory()->role(Role::Staff)->create();

    $this->actingAs($actor)->getJson('/api/v1/users')->assertForbidden();
    $this->actingAs($actor)
        ->postJson("/api/v1/users/{$target->id}/role", ['role' => 'manager'])
        ->assertForbidden();
})->with(['manager', 'analyst', 'staff']);

it('has no route that deletes a user', function (): void {
    /*
     * Deleting a user takes their audit attribution with them: `created_by`
     * becomes null and every "who cancelled this order" question about the
     * last three years becomes unanswerable. Deactivation revokes access
     * completely while leaving the record intact.
     */
    $owner = User::factory()->role(Role::Owner)->create();
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($owner)->deleteJson("/api/v1/users/{$staff->id}")->assertStatus(405);
});

/* -------------------------------------------------------------------------- */
/* Audit */
/* -------------------------------------------------------------------------- */

it('audits a role change with both the old and the new role', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($owner)
        ->postJson("/api/v1/users/{$staff->id}/role", ['role' => 'manager'])
        ->assertOk();

    $log = ActivityLog::query()->where('action', 'user.role_changed')->latest('id')->first();

    expect($log)->not->toBeNull()
        ->and($log->context['from'])->toBe('staff')
        ->and($log->context['to'])->toBe('manager')
        ->and($log->user_id)->toBe($owner->id);
});

it('audits a deactivation under its own action', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($owner)->postJson("/api/v1/users/{$staff->id}/deactivate")->assertOk();

    expect(ActivityLog::query()->where('action', 'user.deactivated')->exists())->toBeTrue();
});

/* -------------------------------------------------------------------------- */
/* Revocation takes effect immediately */
/* -------------------------------------------------------------------------- */

it('cuts off a live session the moment an Owner deactivates the account', function (): void {
    /*
     * SECURITY.md §15.9. MeTest already proves the middleware refuses a
     * deactivated session; what this adds is that the ADMIN ACTION reaches it
     * — that deactivating through the API has the same effect as flipping the
     * column, rather than taking hold at the user's next sign-in, which is not
     * revoking access at all.
     */
    $owner = User::factory()->role(Role::Owner)->create();
    User::factory()->role(Role::Staff)->create(['email' => 'revoked@opsight.test']);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'revoked@opsight.test',
        'password' => 'password',
    ])->assertOk();

    $this->asNewRequest()->getJson('/api/v1/me')->assertOk();

    $staff = User::query()->where('email', 'revoked@opsight.test')->firstOrFail();

    $this->asNewRequest()
        ->actingAs($owner)
        ->postJson("/api/v1/users/{$staff->id}/deactivate")
        ->assertOk();

    // Their very next request, on the session they already hold.
    $this->asNewRequest()
        ->getJson('/api/v1/me')
        ->assertUnauthorized()
        ->assertJsonPath('code', 'auth.account_deactivated');
});

it('ends every remembered device when an owner changes a password', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $staff = User::factory()->role(Role::Staff)->create(['remember_token' => 'remembered-device-token']);

    $this->actingAs($owner)->patchJson("/api/v1/users/{$staff->id}", [
        'password' => 'a-long-enough-password',
        'password_confirmation' => 'a-long-enough-password',
    ])->assertOk();

    // The token the remembered device holds no longer matches anything.
    expect($staff->fresh()->remember_token)
        ->not->toBe('remembered-device-token')
        ->not->toBeNull();
});

it('leaves remembered devices alone when only the name changes', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $staff = User::factory()->role(Role::Staff)->create(['remember_token' => 'remembered-device-token']);

    $this->actingAs($owner)->patchJson("/api/v1/users/{$staff->id}", [
        'name' => 'Renamed',
    ])->assertOk();

    expect($staff->fresh()->remember_token)->toBe('remembered-device-token');
});
