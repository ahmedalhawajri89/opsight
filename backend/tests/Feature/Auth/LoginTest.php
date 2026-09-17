<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\User;

it('logs a user in and returns their abilities', function (): void {
    $user = User::factory()->manager()->create([
        'email' => 'manager@opsight.test',
    ]);

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => 'manager@opsight.test',
        'password' => 'password',
    ]);

    $response->assertOk()
        ->assertJsonPath('data.email', 'manager@opsight.test')
        ->assertJsonPath('data.role', 'manager')
        ->assertJsonStructure(['data' => ['id', 'name', 'email', 'role', 'abilities']]);

    expect($response->json('data.abilities'))->toContain('expenses.view');

    $this->assertAuthenticatedAs($user);
});

it('records the login timestamp', function (): void {
    $user = User::factory()->create(['last_login_at' => null]);

    $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ])->assertOk();

    expect($user->fresh()->last_login_at)->not->toBeNull();
});

it('never returns the password hash', function (): void {
    $user = User::factory()->create();

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ]);

    $response->assertOk()
        ->assertJsonMissingPath('data.password')
        ->assertJsonMissingPath('data.remember_token');
});

/*
|--------------------------------------------------------------------------
| User enumeration
|--------------------------------------------------------------------------
|
| SECURITY.md §7: an unknown email and a wrong password must be
| indistinguishable, or the login form becomes an enumeration endpoint.
|
*/

it('returns an identical response for an unknown email and a wrong password', function (): void {
    User::factory()->create(['email' => 'real@opsight.test']);

    $unknownEmail = $this->postJson('/api/v1/auth/login', [
        'email' => 'ghost@opsight.test',
        'password' => 'password',
    ]);

    $wrongPassword = $this->postJson('/api/v1/auth/login', [
        'email' => 'real@opsight.test',
        'password' => 'not-the-password',
    ]);

    expect($unknownEmail->status())->toBe($wrongPassword->status());
    expect($unknownEmail->json('message'))->toBe($wrongPassword->json('message'));
    expect($unknownEmail->json('code'))->toBe($wrongPassword->json('code'));
    expect($unknownEmail->json('errors'))->toEqual($wrongPassword->json('errors'));
});

/*
|--------------------------------------------------------------------------
| Deactivated users
|--------------------------------------------------------------------------
*/

it('refuses to authenticate a deactivated user', function (): void {
    User::factory()->inactive()->create(['email' => 'gone@opsight.test']);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'gone@opsight.test',
        'password' => 'password',
    ])->assertStatus(422);

    $this->assertGuest();
});

it('makes a deactivated user indistinguishable from a wrong password', function (): void {
    User::factory()->inactive()->create(['email' => 'gone@opsight.test']);
    User::factory()->create(['email' => 'here@opsight.test']);

    $deactivated = $this->postJson('/api/v1/auth/login', [
        'email' => 'gone@opsight.test',
        'password' => 'password',
    ]);

    $wrongPassword = $this->postJson('/api/v1/auth/login', [
        'email' => 'here@opsight.test',
        'password' => 'wrong',
    ]);

    expect($deactivated->json('message'))->toBe($wrongPassword->json('message'));
});

/*
|--------------------------------------------------------------------------
| Validation and rate limiting
|--------------------------------------------------------------------------
*/

it('validates the credentials payload', function (array $payload, string $field): void {
    $this->postJson('/api/v1/auth/login', $payload)
        ->assertStatus(422)
        ->assertJsonPath('code', 'validation.failed')
        ->assertJsonValidationErrors($field);
})->with([
    'missing email' => [['password' => 'password'], 'email'],
    'missing password' => [['email' => 'a@b.test'], 'password'],
    'malformed email' => [['email' => 'not-an-email', 'password' => 'password'], 'email'],
]);

it('rate limits repeated failures for the same email', function (): void {
    User::factory()->create(['email' => 'target@opsight.test']);

    foreach (range(1, 5) as $ignored) {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'target@opsight.test',
            'password' => 'wrong',
        ])->assertStatus(422);
    }

    $this->postJson('/api/v1/auth/login', [
        'email' => 'target@opsight.test',
        'password' => 'wrong',
    ])
        ->assertStatus(429)
        // SECURITY.md §15.7: the refusal says how long it lasts.
        ->assertHeader('Retry-After');
});

it('clears the rate limit after a successful login', function (): void {
    User::factory()->create(['email' => 'target@opsight.test']);

    foreach (range(1, 3) as $ignored) {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'target@opsight.test',
            'password' => 'wrong',
        ])->assertStatus(422);
    }

    $this->postJson('/api/v1/auth/login', [
        'email' => 'target@opsight.test',
        'password' => 'password',
    ])->assertOk();

    // The counter is reset, so a fresh run of failures is not immediately throttled.
    $this->postJson('/api/v1/auth/login', [
        'email' => 'target@opsight.test',
        'password' => 'wrong',
    ])->assertStatus(422);
});

/*
|--------------------------------------------------------------------------
| Logout
|--------------------------------------------------------------------------
*/

/*
 * The whole Sanctum SPA cookie seam, end to end and in one test:
 * log in, use the session, log out, and find the session genuinely dead.
 *
 * asNewRequest() forgets the cached guards between calls so each request
 * re-resolves identity from the cookie, exactly as a fresh worker would.
 * Without it this test would pass even if logout did nothing at all.
 */
it('ends the session so a later request is rejected', function (): void {
    User::factory()->create(['email' => 'session@opsight.test']);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'session@opsight.test',
        'password' => 'password',
    ])->assertOk();

    $this->asNewRequest()->getJson('/api/v1/me')->assertOk();

    $this->asNewRequest()->postJson('/api/v1/auth/logout')->assertNoContent();

    $this->asNewRequest()
        ->getJson('/api/v1/me')
        ->assertUnauthorized()
        ->assertJsonPath('code', 'auth.unauthenticated');
});

it('authenticates by cookie alone, with no token in the payload', function (): void {
    User::factory()->create(['email' => 'cookieonly@opsight.test']);

    $login = $this->postJson('/api/v1/auth/login', [
        'email' => 'cookieonly@opsight.test',
        'password' => 'password',
    ])->assertOk();

    // Nothing in the body could have authenticated the next call — the session
    // cookie is the only credential in play (ADR-002).
    expect($login->json('data'))->not->toHaveKeys(['token', 'access_token', 'api_token']);

    $this->asNewRequest()->getJson('/api/v1/me')->assertOk();
});

it('requires authentication to log out', function (): void {
    $this->postJson('/api/v1/auth/logout')
        ->assertUnauthorized()
        ->assertJsonPath('code', 'auth.unauthenticated');
});

it('issues a session cookie rather than a token', function (): void {
    User::factory()->create(['email' => 'cookie@opsight.test']);

    $response = $this->postJson('/api/v1/auth/login', [
        'email' => 'cookie@opsight.test',
        'password' => 'password',
    ]);

    // ADR-002: no token is ever returned for JavaScript to hold.
    $response->assertOk()
        ->assertJsonMissingPath('data.token')
        ->assertJsonMissingPath('token')
        ->assertJsonMissingPath('access_token');
});

it('resolves each seeded role to its documented ability count', function (Role $role, string $mustHave, string $mustNotHave): void {
    $user = User::factory()->role($role)->create();

    $response = $this->actingAs($user)->getJson('/api/v1/me')->assertOk();

    expect($response->json('data.abilities'))
        ->toContain($mustHave)
        ->not->toContain($mustNotHave);
})->with([
    'owner' => [Role::Owner, 'users.create', 'nonexistent.ability'],
    'manager' => [Role::Manager, 'expenses.create', 'users.create'],
    'analyst' => [Role::Analyst, 'analytics.export', 'orders.create'],
    'staff' => [Role::Staff, 'orders.create', 'metrics.view_cost'],
]);
