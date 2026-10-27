<?php

declare(strict_types=1);

use App\Domain\Integrations\Salla\SallaOAuth;
use App\Models\Integration;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;

/*
|--------------------------------------------------------------------------
| Keeping a store's token alive (P2 phase 6)
|--------------------------------------------------------------------------
|
| Salla's refresh token is SINGLE USE. Using one twice does not waste a call:
| Salla invalidates the access tokens too, and the merchant has to reinstall
| the app. There is no recovery an operator can perform.
|
| So the tests that matter here are not "a refresh works". They are: a token
| that is still good is not refreshed at all, two callers at once refresh
| once between them, the new refresh token replaces the old one, and a
| refusal is final rather than retried into four dead attempts.
|
*/

const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';

beforeEach(function (): void {
    config([
        'integrations.salla.client_id' => 'an-app-id',
        'integrations.salla.client_secret' => 'an-app-secret',
    ]);
});

function connectedStore(array $overrides = []): Integration
{
    return Integration::query()->create(array_replace([
        'provider' => 'salla',
        'external_account_id' => '1305146709',
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => 'the-old-access-token',
        'refresh_token' => 'the-old-refresh-token',
        'token_expires_at' => CarbonImmutable::now()->subHour(),
        'scopes' => ['offline_access'],
    ], $overrides));
}

/** Salla's refresh response, which names the lifetime `expires_in`. */
function refreshed(string $access = 'the-new-access-token', string $refresh = 'the-new-refresh-token'): array
{
    return [
        'access_token' => $access,
        'refresh_token' => $refresh,
        'expires_in' => 1209599,
        'scope' => 'offline_access orders.read_write',
    ];
}

it('does not refresh a token that is still good', function (): void {
    Http::fake();

    $integration = connectedStore(['token_expires_at' => CarbonImmutable::now()->addDays(10)]);

    expect(app(SallaOAuth::class)->accessTokenFor($integration))->toBe('the-old-access-token');

    // The call that is never made is the point: every call spends a token.
    Http::assertNothingSent();
});

it('refreshes a token close enough to expiry to die mid-request', function (): void {
    // A fortnight-long token that passes the check and then expires during
    // the request that used it is the case the margin exists for.
    Http::fake([SALLA_TOKEN_URL => Http::response(refreshed())]);

    $integration = connectedStore(['token_expires_at' => CarbonImmutable::now()->addMinute()]);

    expect(app(SallaOAuth::class)->accessTokenFor($integration))->toBe('the-new-access-token');
});

it('replaces the spent refresh token with the new one', function (): void {
    // The single-use rule, kept: the old token must not survive anywhere,
    // because the next use of it disconnects the shop.
    Http::fake([SALLA_TOKEN_URL => Http::response(refreshed())]);

    $integration = connectedStore();

    app(SallaOAuth::class)->refresh($integration);

    $fresh = $integration->fresh();

    expect($fresh->refresh_token)->toBe('the-new-refresh-token')
        ->and($fresh->access_token)->toBe('the-new-access-token')
        ->and($fresh->status)->toBe(Integration::STATUS_CONNECTED)
        ->and($fresh->token_expires_at->isFuture())->toBeTrue();
});

it('sends the grant Salla documents', function (): void {
    Http::fake([SALLA_TOKEN_URL => Http::response(refreshed())]);

    app(SallaOAuth::class)->refresh(connectedStore());

    Http::assertSent(function ($request): bool {
        $body = [];
        parse_str($request->body(), $body);

        return $request->url() === SALLA_TOKEN_URL
            && $body['grant_type'] === 'refresh_token'
            && $body['refresh_token'] === 'the-old-refresh-token'
            && $body['client_id'] === 'an-app-id'
            && $body['client_secret'] === 'an-app-secret';
    });
});

it('refreshes once when two callers arrive together', function (): void {
    /*
     * THE TEST THIS CLASS EXISTS FOR. Two jobs refreshing the same store
     * would spend the refresh token twice and cost the merchant their
     * installation. The second caller must find the work already done.
     *
     * Driven by refreshing from a STALE copy of the row — which is exactly
     * what the second job holds: it was loaded before the first job wrote.
     */
    Http::fake([SALLA_TOKEN_URL => Http::response(refreshed())]);

    $integration = connectedStore();
    $stale = Integration::query()->find($integration->id);

    app(SallaOAuth::class)->refresh($integration);
    app(SallaOAuth::class)->refresh($stale);

    Http::assertSentCount(1);

    expect($integration->fresh()->refresh_token)->toBe('the-new-refresh-token');
});

it('gives up for good when Salla refuses', function (): void {
    // A 4xx means the token is spent or the merchant revoked the app.
    // Asking again with the same dead token is how one bad refresh becomes
    // four.
    Http::fake([SALLA_TOKEN_URL => Http::response(['error' => 'invalid_grant', 'error_description' => 'Refresh token already used.'], 400)]);

    $integration = connectedStore();

    expect(fn () => app(SallaOAuth::class)->refresh($integration))->toThrow(RuntimeException::class);

    $fresh = $integration->fresh();

    expect($fresh->status)->toBe(Integration::STATUS_REVOKED)
        // Salla's own words: an integration that stopped working is a
        // support conversation, and "it failed" is not a conversation.
        ->and($fresh->last_error)->toBe('Refresh token already used.')
        // And no dead key left in the database.
        ->and($fresh->access_token)->toBeNull()
        ->and($fresh->refresh_token)->toBeNull();
});

it('keeps the connection alive when Salla is merely down', function (): void {
    // A 5xx is Salla's problem, not the connection's. Marking it revoked
    // would turn an outage into a reinstall for every merchant.
    Http::fake([SALLA_TOKEN_URL => Http::response('', 503)]);

    $integration = connectedStore();

    expect(fn () => app(SallaOAuth::class)->refresh($integration))->toThrow(RuntimeException::class);

    $fresh = $integration->fresh();

    expect($fresh->status)->toBe(Integration::STATUS_CONNECTED)
        ->and($fresh->refresh_token)->toBe('the-old-refresh-token');
});

it('says plainly when a connection can never be refreshed', function (): void {
    // Installed without offline_access: no refresh token is ever issued, and
    // the connection simply dies in a fortnight. That belongs on a screen,
    // not in a merchant's phone call.
    Http::fake();

    $integration = connectedStore(['refresh_token' => null]);

    expect(fn () => app(SallaOAuth::class)->refresh($integration))->toThrow(RuntimeException::class);

    $fresh = $integration->fresh();

    expect($fresh->status)->toBe(Integration::STATUS_EXPIRED)
        ->and($fresh->last_error)->toContain('offline access');

    Http::assertNothingSent();
});

it('does not touch the connection when this installation has no credentials', function (): void {
    // A deployment problem, not a connection problem: the row must recover
    // the moment the credentials are set.
    Http::fake();

    config(['integrations.salla.client_id' => null]);

    $integration = connectedStore();

    expect(fn () => app(SallaOAuth::class)->refresh($integration))->toThrow(RuntimeException::class);

    expect($integration->fresh()->status)->toBe(Integration::STATUS_CONNECTED);

    Http::assertNothingSent();
});
