<?php

declare(strict_types=1);

use App\Domain\Integrations\Salla\SallaTokens;
use App\Domain\Integrations\WebhookProviders;
use App\Jobs\ProcessUnclaimedDelivery;
use App\Models\Business;
use App\Models\Integration;
use App\Models\UnclaimedIntegration;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Carbon\CarbonImmutable;

/*
|--------------------------------------------------------------------------
| A store that connects before anyone says whose it is (P2 phase 6)
|--------------------------------------------------------------------------
|
| Salla's Easy mode delivers a store's tokens in an install webhook, and that
| delivery carries nothing identifying the business it belongs to here. So
| for a moment a real connection exists that belongs to nobody — and the
| tests that matter are the ones about that moment: the tokens are kept
| somewhere that is nobody's, they are kept for a bounded time, and no
| business gets them by accident.
|
*/

const INSTALL_SECRET = 'a-webhook-secret-from-the-partners-dashboard';

const INSTALL_MERCHANT = 1305146709;

beforeEach(function (): void {
    config(['integrations.secrets.salla' => INSTALL_SECRET]);
});

/** @param array<string, mixed> $data */
function installDelivery(array $data = [], string $event = 'app.store.authorize'): array
{
    return [
        'event' => $event,
        'merchant' => INSTALL_MERCHANT,
        'created_at' => 'Sun Jun 26 2022 12:21:48 GMT+0300',
        'data' => array_replace([
            'access_token' => 'an-access-token',
            'refresh_token' => 'a-refresh-token',
            'expires' => 1209599,
            'scope' => 'offline_access orders.read_write products.read_write',
        ], $data),
    ];
}

/** @param array<string, mixed> $payload */
function postInstall(array $payload)
{
    $body = (string) json_encode($payload);

    return test()->call(
        'POST',
        '/api/v1/webhooks/salla',
        server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SALLA_SIGNATURE' => hash_hmac('sha256', $body, INSTALL_SECRET),
        ],
        content: $body,
    );
}

describe('the install delivery', function (): void {
    it('keeps a store nobody has claimed, in a table that belongs to nobody', function (): void {
        postInstall(installDelivery())->assertStatus(202);

        $pending = UnclaimedIntegration::query()->sole();

        expect($pending->provider)->toBe('salla')
            ->and($pending->external_account_id)->toBe((string) INSTALL_MERCHANT)
            ->and($pending->access_token)->toBe('an-access-token')
            ->and($pending->refresh_token)->toBe('a-refresh-token')
            ->and($pending->scopes)->toContain('offline_access');
    });

    it('is not thrown away for having no business, as every other delivery is', function (): void {
        // The whole point of acceptsUnmatched. Before it, the one delivery
        // that starts an integration was the one the door discarded.
        postInstall(installDelivery())->assertStatus(202);

        $receipt = WebhookReceipt::query()->withoutGlobalScope(BusinessScope::class)->sole();

        expect($receipt->business_id)->toBeNull()
            ->and($receipt->isProcessed())->toBeTrue()
            ->and($receipt->error)->toBeNull();
    });

    it('still throws away an ordinary delivery from a store nobody has connected', function (): void {
        $order = installDelivery(event: 'order.created');

        postInstall($order)->assertStatus(202);

        $receipt = WebhookReceipt::query()->withoutGlobalScope(BusinessScope::class)->sole();

        expect($receipt->isProcessed())->toBeFalse()
            ->and($receipt->error)->toContain('No connected business');
        expect(UnclaimedIntegration::query()->count())->toBe(0);
    });

    it('gives the tokens a deadline rather than keeping them for ever', function (): void {
        // Unclaimed tokens are a liability. A forgotten row is a live key to
        // someone's shop sitting in a table nothing reads.
        postInstall(installDelivery())->assertStatus(202);

        $pending = UnclaimedIntegration::query()->sole();

        expect($pending->expires_at->isFuture())->toBeTrue()
            ->and($pending->expires_at->diffInMinutes(CarbonImmutable::now()))
            ->toBeLessThanOrEqual(UnclaimedIntegration::CLAIM_WINDOW_MINUTES);
    });

    it('replaces a store\'s own pending tokens when it installs twice', function (): void {
        postInstall(installDelivery())->assertStatus(202);
        postInstall(installDelivery(['access_token' => 'the-second-access-token']))->assertStatus(202);

        $pending = UnclaimedIntegration::query()->sole();

        // One row, and the live token, not the dead one left behind it.
        expect($pending->access_token)->toBe('the-second-access-token');
    });

    it('accepts either spelling of the event, because the documentation uses both', function (): void {
        postInstall(installDelivery(event: 'app.store.authorized'))->assertStatus(202);

        expect(UnclaimedIntegration::query()->count())->toBe(1);
    });

    it('refuses an install delivery that carries no token', function (): void {
        /*
         * Driven through the job, not the endpoint. Tests run with
         * QUEUE_CONNECTION=sync, so a job that throws surfaces as a 500 from
         * a request that answers 202 in production — testing it through the
         * door would assert the test environment, not the behaviour.
         */
        $receipt = WebhookReceipt::query()->create([
            'business_id' => null,
            'provider' => 'salla',
            'event' => 'app.store.authorize',
            'external_event_id' => 'salla:tokenless',
            'payload' => installDelivery(['access_token' => null]),
            'signature_ok' => true,
        ]);

        expect(fn () => (new ProcessUnclaimedDelivery($receipt->id))->handle(app(WebhookProviders::class)))
            ->toThrow(RuntimeException::class);

        $fresh = WebhookReceipt::query()->withoutGlobalScope(BusinessScope::class)->find($receipt->id);

        expect($fresh->isProcessed())->toBeFalse()
            ->and($fresh->error)->toContain('no access token')
            ->and(UnclaimedIntegration::query()->count())->toBe(0);
    });
});

describe('a store that is already connected', function (): void {
    it('is reauthorised in place, not queued up for someone else to claim', function (): void {
        $integration = Integration::query()->create([
            'provider' => 'salla',
            'external_account_id' => (string) INSTALL_MERCHANT,
            'status' => Integration::STATUS_EXPIRED,
            'access_token' => 'the-old-access-token',
            'last_error' => 'The token expired.',
        ]);

        postInstall(installDelivery(['access_token' => 'the-renewed-access-token']))->assertStatus(202);

        $fresh = $integration->fresh();

        expect($fresh->access_token)->toBe('the-renewed-access-token')
            ->and($fresh->status)->toBe(Integration::STATUS_CONNECTED)
            ->and($fresh->last_error)->toBeNull()
            // And emphatically NOT left waiting to be claimed by anyone else.
            ->and(UnclaimedIntegration::query()->count())->toBe(0);
    });

    it('reauthorises the business that owns the store, not the one in context', function (): void {
        $theirs = Business::factory()->create();

        $integration = CurrentBusiness::get()->run($theirs->id, fn () => Integration::query()->create([
            'provider' => 'salla',
            'external_account_id' => (string) INSTALL_MERCHANT,
            'status' => Integration::STATUS_CONNECTED,
            'access_token' => 'their-old-token',
        ]));

        postInstall(installDelivery(['access_token' => 'their-new-token']))->assertStatus(202);

        $fresh = Integration::query()->withoutGlobalScope(BusinessScope::class)->find($integration->id);

        expect($fresh->business_id)->toBe($theirs->id)
            ->and($fresh->access_token)->toBe('their-new-token');
    });
});

describe('reading the lifetime Salla states', function (): void {
    it('reads a duration in seconds, which is what the example actually is', function (): void {
        $tokens = SallaTokens::fromPayload(['access_token' => 't', 'expires' => 1209599]);

        // Two weeks less a second, from now — not a date in 1970.
        expect(CarbonImmutable::now()->diffInDays($tokens->expiresAt))->toBeGreaterThan(13);
    });

    it('reads a unix timestamp, which is what the prose says it is', function (): void {
        $when = CarbonImmutable::now()->addDays(14);

        $tokens = SallaTokens::fromPayload(['access_token' => 't', 'expires' => $when->getTimestamp()]);

        expect($tokens->expiresAt->toDateString())->toBe($when->toDateString());
    });

    it('reads expires_in, which is what the refresh response calls it', function (): void {
        $tokens = SallaTokens::fromPayload(['access_token' => 't', 'expires_in' => 1209599]);

        expect($tokens->expiresAt->isFuture())->toBeTrue();
    });

    it('treats a missing or nonsense lifetime as already expired', function (): void {
        // So the next call refreshes, rather than sending a dead token and
        // reading the 401 as the merchant having uninstalled.
        expect(SallaTokens::fromPayload(['access_token' => 't'])->expiresAt->isFuture())->toBeFalse();
    });

    it('knows a connection that can never be refreshed', function (): void {
        // No offline_access scope means no refresh token, and the connection
        // simply dies in a fortnight. That belongs on a screen, not in a
        // merchant's phone call.
        $tokens = SallaTokens::fromPayload(['access_token' => 't', 'expires' => 1209599]);

        expect($tokens->canRefresh())->toBeFalse();
    });
});
