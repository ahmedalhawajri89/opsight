<?php

declare(strict_types=1);
use Illuminate\Contracts\Debug\ExceptionHandler;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;

it('reports healthy without authentication', function (): void {
    $this->getJson('/api/v1/health')
        ->assertOk()
        ->assertJsonPath('data.status', 'ok')
        ->assertJsonPath('data.checks.database', true)
        ->assertJsonStructure(['data' => ['status', 'checks', 'time']]);
});

it('exposes no version or configuration detail', function (): void {
    // A health endpoint is a public surface. It reports reachability, nothing more.
    $payload = $this->getJson('/api/v1/health')->json('data');

    expect(array_keys($payload))->toEqualCanonicalizing(['status', 'checks', 'time']);
});

/*
|--------------------------------------------------------------------------
| The error contract
|--------------------------------------------------------------------------
|
| Every failure carries a stable `code`. The client branches on the code, never
| on the human-readable message (ARCHITECTURE.md §4).
|
*/

it('returns a stable code for a missing route', function (): void {
    $this->getJson('/api/v1/does-not-exist')
        ->assertNotFound()
        ->assertJsonPath('code', 'resource.not_found')
        ->assertJsonStructure(['message', 'code']);
});

it('maps a CSRF failure to its own code so the client can refresh and retry', function (): void {
    expect(config('app.debug'))->toBeIn([true, false]);

    // Exercised through the real middleware stack in the manual HTTP check;
    // asserted here at the contract level so the code cannot be renamed
    // without a failing test.
    $rendered = app(ExceptionHandler::class)->render(
        Request::create('/api/v1/auth/logout', 'POST', server: ['HTTP_ACCEPT' => 'application/json']),
        new TokenMismatchException('CSRF token mismatch.'),
    );

    expect($rendered->getStatusCode())->toBe(419);
    expect(json_decode($rendered->getContent(), true)['code'])->toBe('csrf.token_mismatch');
});

it('maps a throttled request to the rate limit code', function (): void {
    $rendered = app(ExceptionHandler::class)->render(
        Request::create('/api/v1/me', 'GET', server: ['HTTP_ACCEPT' => 'application/json']),
        new ThrottleRequestsException('Too Many Attempts.'),
    );

    expect($rendered->getStatusCode())->toBe(429);
    expect(json_decode($rendered->getContent(), true)['code'])->toBe('rate_limit.exceeded');
});
