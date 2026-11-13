<?php

declare(strict_types=1);

use App\Http\Middleware\TrustFrontendProxy;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
 * Which address the API believes a request came from, and the sign-in limit
 * that does not depend on it (security audit, 2026-11-13).
 */

beforeEach(function (): void {
    Route::get('/__test/address', static fn (Request $request): array => [
        'ip' => $request->ip(),
        'secret_seen' => $request->headers->has(TrustFrontendProxy::SECRET_HEADER),
    ]);
});

it('takes the address the frontend forwarded when the secret matches', function (): void {
    config(['app.proxy_secret' => 'shared-secret']);

    $this->getJson('/__test/address', [
        TrustFrontendProxy::IP_HEADER => '203.0.113.9',
        TrustFrontendProxy::SECRET_HEADER => 'shared-secret',
    ])
        ->assertJsonPath('ip', '203.0.113.9')
        // Nothing after the middleware can read the secret back.
        ->assertJsonPath('secret_seen', false);
});

it('ignores a forwarded address with a wrong secret', function (): void {
    config(['app.proxy_secret' => 'shared-secret']);

    $this->getJson('/__test/address', [
        TrustFrontendProxy::IP_HEADER => '203.0.113.9',
        TrustFrontendProxy::SECRET_HEADER => 'guessed',
    ])->assertJsonPath('ip', '127.0.0.1');
});

it('ignores a forwarded address when no secret is configured', function (): void {
    config(['app.proxy_secret' => '']);

    $this->getJson('/__test/address', [
        TrustFrontendProxy::IP_HEADER => '203.0.113.9',
        TrustFrontendProxy::SECRET_HEADER => '',
    ])->assertJsonPath('ip', '127.0.0.1');
});

it('ignores a forwarded value that is not an address', function (): void {
    config(['app.proxy_secret' => 'shared-secret']);

    $this->getJson('/__test/address', [
        TrustFrontendProxy::IP_HEADER => 'not-an-ip',
        TrustFrontendProxy::SECRET_HEADER => 'shared-secret',
    ])->assertJsonPath('ip', '127.0.0.1');
});

it('does not let X-Forwarded-For choose the address', function (): void {
    config(['app.proxy_secret' => '']);

    $this->getJson('/__test/address', ['X-Forwarded-For' => '198.51.100.7'])
        ->assertJsonPath('ip', '127.0.0.1');
});

it('limits guesses at one account even when they come from many addresses', function (): void {
    config(['app.proxy_secret' => 'shared-secret']);

    $user = User::factory()->create(['email' => 'target@opsight.test']);

    // Thirty wrong passwords, each from an address of its own.
    foreach (range(1, 30) as $n) {
        $this->postJson('/api/v1/auth/login', [
            'email' => $user->email,
            'password' => 'wrong-password-'.$n,
        ], [
            TrustFrontendProxy::IP_HEADER => '203.0.113.'.$n,
            TrustFrontendProxy::SECRET_HEADER => 'shared-secret',
        ])->assertStatus(422);
    }

    // The thirty-first is refused before the password is looked at.
    $this->postJson('/api/v1/auth/login', [
        'email' => $user->email,
        'password' => 'password',
    ], [
        TrustFrontendProxy::IP_HEADER => '203.0.113.200',
        TrustFrontendProxy::SECRET_HEADER => 'shared-secret',
    ])->assertStatus(429);
});
