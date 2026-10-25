<?php

declare(strict_types=1);

use App\Domain\Integrations\WebhookProviders;
use App\Jobs\ProcessWebhookReceipt;
use App\Models\Business;
use App\Models\Integration;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;
use Tests\Support\FakeWebhookProvider;

/*
|--------------------------------------------------------------------------
| Receiving a delivery from a provider (ADR-027)
|--------------------------------------------------------------------------
|
| No real provider ships with this phase, so these run against a fake that
| signs with HMAC-SHA256 the way Salla and Meta do. What is under test is the
| sequence every provider shares: verify, store under the provider's own
| event id, answer at once, hand off.
|
*/

const SECRET = 'a-shared-signing-secret-for-the-tests';

beforeEach(function (): void {
    FakeWebhookProvider::reset();

    config([
        'integrations.providers.fake' => FakeWebhookProvider::class,
        'integrations.secrets.fake' => SECRET,
    ]);

    // The business this provider's deliveries belong to.
    Integration::query()->create([
        'provider' => 'fake',
        'external_account_id' => 'store-1',
        'status' => Integration::STATUS_CONNECTED,
    ]);
});

/** @param array<string, mixed> $payload */
function deliver(array $payload, ?string $signature = null, string $provider = 'fake'): TestResponse
{
    $body = (string) json_encode($payload);

    return test()->call(
        'POST',
        "/api/v1/webhooks/{$provider}",
        server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_FAKE_SIGNATURE' => $signature ?? FakeWebhookProvider::sign($body, SECRET),
        ],
        content: $body,
    );
}

/** @return array<string, mixed> */
function delivery(string $id = 'evt-1', string $store = 'store-1'): array
{
    return ['event_id' => $id, 'event' => 'order.created', 'store_id' => $store, 'order' => ['total' => '25.000']];
}

/*
|--------------------------------------------------------------------------
| The signature is the authentication
|--------------------------------------------------------------------------
*/

it('accepts a signed delivery, stores it, and hands it off', function (): void {
    Queue::fake();

    deliver(delivery())->assertStatus(202)->assertJsonPath('status', 'accepted');

    $receipt = WebhookReceipt::query()->firstOrFail();

    expect($receipt->provider)->toBe('fake')
        ->and($receipt->event)->toBe('order.created')
        ->and($receipt->external_event_id)->toBe('evt-1')
        ->and($receipt->signature_ok)->toBeTrue()
        ->and($receipt->business_id)->not->toBeNull()
        ->and($receipt->processed_at)->toBeNull();

    Queue::assertPushed(ProcessWebhookReceipt::class, fn ($job): bool => $job->receiptId === $receipt->id);
});

it('refuses a tampered signature, and keeps the evidence', function (): void {
    Queue::fake();

    deliver(delivery(), signature: 'deadbeef')->assertStatus(401);

    $receipt = WebhookReceipt::query()->firstOrFail();

    // Stored, so an operator can tell a rotated secret from someone probing.
    expect($receipt->signature_ok)->toBeFalse()
        ->and($receipt->business_id)->toBeNull()
        ->and($receipt->event)->toBe('unverified');

    Queue::assertNothingPushed();
});

it('refuses a delivery with no signature at all', function (): void {
    Queue::fake();

    deliver(delivery(), signature: '')->assertStatus(401);

    Queue::assertNothingPushed();
});

it('is a 404 for a provider this installation does not accept', function (): void {
    Queue::fake();

    deliver(delivery(), provider: 'salla')->assertNotFound();

    // Nothing stored: an unknown name must not be a free write to the table.
    expect(WebhookReceipt::query()->count())->toBe(0);
});

it('refuses a body too large to be a real delivery', function (): void {
    config(['integrations.max_payload_kb' => 1]);

    deliver(['event_id' => 'evt-big', 'event' => 'order.created', 'store_id' => 'store-1', 'blob' => str_repeat('x', 2048)])
        ->assertStatus(413);
});

/*
|--------------------------------------------------------------------------
| A retry is not a second order
|--------------------------------------------------------------------------
*/

it('handles the same delivery once, however many times it arrives', function (): void {
    Queue::fake();

    deliver(delivery('evt-7'))->assertStatus(202)->assertJsonPath('status', 'accepted');
    deliver(delivery('evt-7'))->assertStatus(202)->assertJsonPath('status', 'duplicate');
    deliver(delivery('evt-7'))->assertStatus(202)->assertJsonPath('status', 'duplicate');

    expect(WebhookReceipt::query()->where('external_event_id', 'evt-7')->count())->toBe(1);

    Queue::assertPushed(ProcessWebhookReceipt::class, 1);
});

it('still refuses a duplicate when two deliveries race past the lookup', function (): void {
    Queue::fake();

    // The row exists already; the controller's check is bypassed by writing
    // it directly, leaving the unique index as the only thing standing.
    WebhookReceipt::query()->create([
        'business_id' => null,
        'provider' => 'fake',
        'event' => 'order.created',
        'external_event_id' => 'evt-race',
        'payload' => [],
        'signature_ok' => true,
    ]);

    deliver(delivery('evt-race'))->assertStatus(202)->assertJsonPath('status', 'duplicate');

    expect(WebhookReceipt::query()->where('external_event_id', 'evt-race')->count())->toBe(1);
});

/*
|--------------------------------------------------------------------------
| A delivery for nobody
|--------------------------------------------------------------------------
*/

it('keeps a genuine delivery whose store it cannot place, and queues nothing', function (): void {
    Queue::fake();

    deliver(delivery('evt-9', store: 'store-unknown'))->assertStatus(202);

    $receipt = WebhookReceipt::query()->firstOrFail();

    expect($receipt->signature_ok)->toBeTrue()
        ->and($receipt->business_id)->toBeNull()
        ->and($receipt->error)->toContain('No connected business');

    // A job with no business cannot run; failing it four times would add
    // nothing this row does not already say.
    Queue::assertNothingPushed();
});

/*
|--------------------------------------------------------------------------
| The whole way through, with the queue running
|--------------------------------------------------------------------------
*/

it('runs the handler as the business the delivery belongs to', function (): void {
    deliver(delivery('evt-11'))->assertStatus(202);

    $receipt = WebhookReceipt::query()->firstOrFail();

    expect(FakeWebhookProvider::$handled)->toHaveCount(1)
        ->and(FakeWebhookProvider::$handled[0]['business'])->toBe($receipt->business_id)
        // The context the handler saw, which is the whole point of the job
        // middleware: a worker has no signed-in user to take it from.
        ->and(FakeWebhookProvider::$handled[0]['context'])->toBe($receipt->business_id)
        ->and($receipt->fresh()->processed_at)->not->toBeNull();
});

it('does not inherit the business of whatever ran before it', function (): void {
    /*
     * The failure this exists to catch: a long-lived worker finishes a job
     * for business A and starts one for business B. Here the HTTP request
     * itself is made while A is in context, and the delivery belongs to B.
     */
    $other = Business::query()->create(['name' => 'Al Noor Trading', 'slug' => 'al-noor-'.uniqid()]);

    $theirIntegration = CurrentBusiness::get()->run($other->id, fn () => Integration::query()->create([
        'provider' => 'fake',
        'external_account_id' => 'store-2',
        'status' => Integration::STATUS_CONNECTED,
    ]));

    expect(CurrentBusiness::get()->idOrNull())->not->toBe($other->id);

    deliver(delivery('evt-13', store: 'store-2'))->assertStatus(202);

    expect(FakeWebhookProvider::$handled[0]['business'])->toBe($other->id)
        ->and(FakeWebhookProvider::$handled[0]['context'])->toBe($other->id)
        ->and($theirIntegration->business_id)->toBe($other->id);

    // And the context the request was made in is exactly as it was.
    expect(CurrentBusiness::get()->idOrNull())->not->toBe($other->id);
});

it('records a failing handler on the receipt and leaves it unprocessed', function (): void {
    /*
     * The job is run directly rather than through the endpoint. Under the
     * test queue a dispatch runs inline, so a handler that throws would come
     * back as a 500 from a request that in production returns 202 and fails
     * later in a worker. Driving the job is the honest way to assert what a
     * worker would see.
     */
    Queue::fake();
    deliver(delivery('evt-15'))->assertStatus(202);

    $receipt = WebhookReceipt::query()->firstOrFail();

    FakeWebhookProvider::$throws = new RuntimeException('The store said no.');

    expect(fn () => (new ProcessWebhookReceipt($receipt->id, $receipt->business_id))
        ->handle(app(WebhookProviders::class)))
        // Rethrown, which is what makes the queue retry it.
        ->toThrow(RuntimeException::class, 'The store said no.');

    $receipt->refresh();

    expect($receipt->processed_at)->toBeNull()
        ->and($receipt->error)->toBe('The store said no.')
        ->and($receipt->attempts)->toBe(1);
});

it('does nothing twice: a receipt already processed is left alone', function (): void {
    Queue::fake();
    deliver(delivery('evt-17'))->assertStatus(202);

    $receipt = WebhookReceipt::query()->firstOrFail();
    $receipt->markProcessed();

    (new ProcessWebhookReceipt($receipt->id, $receipt->business_id))
        ->handle(app(WebhookProviders::class));

    expect(FakeWebhookProvider::$handled)->toBeEmpty();
});

it('refuses to act on a receipt that is not the business it was queued for', function (): void {
    Queue::fake();
    deliver(delivery('evt-19'))->assertStatus(202);

    $receipt = WebhookReceipt::query()->firstOrFail();
    $other = Business::query()->create(['name' => 'Elsewhere', 'slug' => 'elsewhere-'.uniqid()]);

    (new ProcessWebhookReceipt($receipt->id, $other->id))
        ->handle(app(WebhookProviders::class));

    expect(FakeWebhookProvider::$handled)->toBeEmpty()
        ->and($receipt->fresh()->error)->toContain('does not belong to the business');
});
