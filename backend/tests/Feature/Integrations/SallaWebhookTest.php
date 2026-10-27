<?php

declare(strict_types=1);

use App\Domain\Integrations\Salla\SallaWebhooks;
use App\Models\Business;
use App\Models\Integration;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;

/*
|--------------------------------------------------------------------------
| Salla at the door (P2 phase 6, ADR-027)
|--------------------------------------------------------------------------
|
| This endpoint is unauthenticated by necessity — a provider has no session —
| so the signature IS the authentication, and these tests are mostly about
| refusal. Each of the first group would pass against an implementation that
| accepted everything, except for the one thing it asserts.
|
| The payloads follow the envelope Salla documents for order events:
| `event`, `merchant`, `created_at`, `data`.
|
*/

const SALLA_SECRET = 'a-webhook-secret-from-the-partners-dashboard';

const SALLA_MERCHANT = 1305146709;

beforeEach(function (): void {
    config(['integrations.secrets.salla' => SALLA_SECRET]);
});

/** @param array<string, mixed> $overrides */
function sallaPayload(array $overrides = []): array
{
    return array_replace([
        'event' => 'order.created',
        'merchant' => SALLA_MERCHANT,
        'created_at' => 'Sun Jun 26 2022 12:21:48 GMT+0300',
        'data' => ['id' => 987654, 'reference_id' => 12, 'currency' => 'SAR'],
    ], $overrides);
}

/** Posts a delivery the way Salla does: raw body, HMAC in the header. */
function deliverToSalla(array $payload, ?string $signature = null, string $secret = SALLA_SECRET)
{
    $body = (string) json_encode($payload);

    return test()->call(
        'POST',
        '/api/v1/webhooks/salla',
        server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SALLA_SIGNATURE' => $signature ?? hash_hmac('sha256', $body, $secret),
        ],
        content: $body,
    );
}

describe('the signature', function (): void {
    it('accepts a delivery signed with the shared secret', function (): void {
        deliverToSalla(sallaPayload())->assertStatus(202);

        expect(WebhookReceipt::query()->where('signature_ok', true)->count())->toBe(1);
    });

    it('refuses a body that was altered after it was signed', function (): void {
        $body = (string) json_encode(sallaPayload());
        $signature = hash_hmac('sha256', $body, SALLA_SECRET);

        // One digit of the order total, which is the whole point of signing.
        deliverToSalla(sallaPayload(['data' => ['id' => 987654, 'total' => '9.99']]), $signature)
            ->assertStatus(401);

        expect(WebhookReceipt::query()->where('signature_ok', false)->count())->toBe(1);
    });

    it('refuses a delivery signed with the wrong secret', function (): void {
        deliverToSalla(sallaPayload(), secret: 'the-secret-from-another-installation')->assertStatus(401);
    });

    it('refuses a delivery carrying no signature at all', function (): void {
        deliverToSalla(sallaPayload(), signature: '')->assertStatus(401);
    });

    it('is a timing-safe comparison, not a string equality', function (): void {
        // Salla's own PHP sample compares with ===, which leaks the signature
        // one byte at a time to anyone willing to measure. The guard is that
        // this source does not do that.
        $source = file_get_contents(app_path('Domain/Integrations/Salla/SallaWebhooks.php'));

        expect($source)->toContain('hash_equals(')
            ->and($source)->not->toContain('$expected === $signature');
    });

    it('answers 404, not 401, when no secret is configured', function (): void {
        // An installation that has not connected Salla has no endpoint —
        // and from outside, an unconfigured provider and a misspelt one must
        // look identical.
        config(['integrations.secrets.salla' => null]);

        deliverToSalla(sallaPayload())->assertStatus(404);

        expect(WebhookReceipt::query()->count())->toBe(0);
    });
});

describe('recognising a retry', function (): void {
    it('treats a redelivery of the same event as one event', function (): void {
        // Salla retries three times, about five minutes apart. A retry that
        // produced a second order would be the whole importer's worst bug.
        $payload = sallaPayload();

        deliverToSalla($payload)->assertStatus(202);
        deliverToSalla($payload)->assertStatus(202)->assertJsonPath('status', 'duplicate');

        expect(WebhookReceipt::query()->count())->toBe(1);
    });

    it('does not mistake a second update of the same order for a retry', function (): void {
        /*
         * The obvious id — event + merchant + data.id — collides here, and
         * the update that collides is the one carrying the new status. The
         * id is a hash of the whole payload for exactly this case.
         */
        $provider = new SallaWebhooks;

        $first = sallaPayload(['event' => 'order.updated', 'data' => ['id' => 987654, 'status' => ['slug' => 'under_review']]]);
        $second = sallaPayload(['event' => 'order.updated', 'data' => ['id' => 987654, 'status' => ['slug' => 'completed']]]);

        expect($provider->externalEventId($first))->not->toBe($provider->externalEventId($second));
    });

    it('gives one id to the same delivery however its keys are ordered', function (): void {
        $provider = new SallaWebhooks;

        $ordered = ['event' => 'order.created', 'merchant' => SALLA_MERCHANT, 'data' => ['id' => 1, 'currency' => 'SAR']];
        $shuffled = ['data' => ['currency' => 'SAR', 'id' => 1], 'merchant' => SALLA_MERCHANT, 'event' => 'order.created'];

        expect($provider->externalEventId($ordered))->toBe($provider->externalEventId($shuffled));
    });
});

describe('finding the business', function (): void {
    it('matches a connected store by its Salla merchant id', function (): void {
        Integration::query()->create([
            'provider' => 'salla',
            'external_account_id' => (string) SALLA_MERCHANT,
            'status' => Integration::STATUS_CONNECTED,
        ]);

        $mine = CurrentBusiness::get()->id();

        expect((new SallaWebhooks)->businessIdFor(sallaPayload()))->toBe($mine);
    });

    it('finds it from outside any business context, where the scope would hide it', function (): void {
        /*
         * The trap this exists for: `Integration` is scoped to a business, and
         * the door is the one place in the application where no business
         * context exists yet. Without removing the scope the lookup returns
         * nothing and every genuine delivery is filed as belonging to nobody.
         */
        Integration::query()->create([
            'provider' => 'salla',
            'external_account_id' => (string) SALLA_MERCHANT,
            'status' => Integration::STATUS_CONNECTED,
        ]);

        $mine = CurrentBusiness::get()->id();

        CurrentBusiness::get()->forget();

        expect((new SallaWebhooks)->businessIdFor(sallaPayload()))->toBe($mine);
    });

    it('does not hand one business a delivery meant for another store', function (): void {
        $theirs = Business::factory()->create();

        CurrentBusiness::get()->run($theirs->id, function (): void {
            Integration::query()->create([
                'provider' => 'salla',
                'external_account_id' => '999999999',
                'status' => Integration::STATUS_CONNECTED,
            ]);
        });

        Integration::query()->create([
            'provider' => 'salla',
            'external_account_id' => (string) SALLA_MERCHANT,
            'status' => Integration::STATUS_CONNECTED,
        ]);

        expect((new SallaWebhooks)->businessIdFor(sallaPayload(['merchant' => 999999999])))->toBe($theirs->id);
    });

    it('returns nothing for a store no business has connected', function (): void {
        expect((new SallaWebhooks)->businessIdFor(sallaPayload()))->toBeNull();
    });

    it('keeps a genuine delivery from an unknown store, with its reason', function (): void {
        // Most likely a store that disconnected while a delivery was in
        // flight. The row is the evidence; a job with no business cannot run.
        deliverToSalla(sallaPayload())->assertStatus(202);

        $receipt = WebhookReceipt::query()->withoutGlobalScope(BusinessScope::class)->sole();

        expect($receipt->signature_ok)->toBeTrue()
            ->and($receipt->business_id)->toBeNull()
            ->and($receipt->error)->not->toBeNull();
    });
});

describe('the envelope', function (): void {
    it('reads the event name Salla sends', function (): void {
        expect((new SallaWebhooks)->event(sallaPayload(['event' => 'order.status.updated'])))
            ->toBe('order.status.updated');
    });

    it('names a nameless event rather than storing an empty string', function (): void {
        expect((new SallaWebhooks)->event(['merchant' => SALLA_MERCHANT]))->toBe('unknown');
    });
});
