<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/*
|--------------------------------------------------------------------------
| The public demo's accounts
|--------------------------------------------------------------------------
|
| config/demo.php. The demo is shared by everyone who opens it, so the
| accounts it offers on the sign-in page must still work for the next
| visitor: nobody may change their password, email, role or status. Every
| other change a role may make stays open, and outside the demo nothing here
| applies at all.
|
*/

beforeEach(function (): void {
    RateLimiter::clear('password');

    $this->owner = User::factory()->role(Role::Owner)->create([
        'email' => 'owner@opsight.test',
        'password' => Hash::make('password'),
    ]);
    $this->manager = User::factory()->role(Role::Manager)->create(['email' => 'manager@opsight.test']);
});

describe('in the demo', function (): void {
    beforeEach(fn () => config(['demo.enabled' => true]));

    it('refuses to change a demo account\'s own password', function (): void {
        $this->actingAs($this->owner)
            ->patchJson('/api/v1/me/password', [
                'current_password' => 'password',
                'password' => 'a-brand-new-passphrase',
            ])
            ->assertForbidden()
            ->assertJsonPath('code', 'demo.account_protected');

        expect(Hash::check('password', $this->owner->fresh()->password))->toBeTrue();
    });

    it('refuses to deactivate, demote or edit another demo account', function (string $method, string $path, array $body): void {
        $this->actingAs($this->owner)
            ->json($method, str_replace('{id}', (string) $this->manager->id, $path), $body)
            ->assertForbidden()
            ->assertJsonPath('code', 'demo.account_protected');

        $fresh = $this->manager->fresh();

        expect($fresh->is_active)->toBeTrue()
            ->and($fresh->role)->toBe(Role::Manager)
            ->and($fresh->email)->toBe('manager@opsight.test');
    })->with([
        'deactivate' => ['POST', '/api/v1/users/{id}/deactivate', []],
        'change role' => ['POST', '/api/v1/users/{id}/role', ['role' => 'staff']],
        'edit' => ['PATCH', '/api/v1/users/{id}', ['email' => 'taken@example.com']],
    ]);

    it('still lets a visitor change an account they added themselves', function (): void {
        $added = User::factory()->role(Role::Staff)->create(['email' => 'someone@example.com']);

        $this->actingAs($this->owner)
            ->postJson("/api/v1/users/{$added->id}/deactivate")
            ->assertOk();

        expect($added->fresh()->is_active)->toBeFalse();
    });

    it('leaves reading the accounts alone', function (): void {
        $this->actingAs($this->owner)
            ->getJson("/api/v1/users/{$this->manager->id}")
            ->assertOk();
    });
});

it('protects nothing outside the demo', function (): void {
    config(['demo.enabled' => false]);

    $this->actingAs($this->owner)
        ->postJson("/api/v1/users/{$this->manager->id}/deactivate")
        ->assertOk();

    expect($this->manager->fresh()->is_active)->toBeFalse();
});
