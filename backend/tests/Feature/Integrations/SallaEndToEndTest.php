<?php

declare(strict_types=1);

use App\Domain\Integrations\WebhookProviders;
use App\Domain\Orders\OrderStatus;
use App\Jobs\ProcessWebhookReceipt;
use App\Models\Integration;
use App\Models\Order;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Support\Facades\Queue;

/*
|--------------------------------------------------------------------------
| A delivery from Salla becomes an order here (ADR-029)
|--------------------------------------------------------------------------
|
| The other Salla suites each test one joint: the signature, the claim, the
| token, the mapping. This one tests that they are connected — a signed
| delivery arriving at the public endpoint and coming out the far end as an
| order, in the right business, with the right figures.
|
| It is the test that would have caught the importer being wired to nothing,
| which is what the handler did until this phase: verified every delivery
| correctly and then threw them all away.
|
*/

const E2E_SECRET = 'a-webhook-secret-from-the-partners-dashboard';

const E2E_MERCHANT = 1305146709;

beforeEach(function (): void {
    config(['integrations.secrets.salla' => E2E_SECRET]);

    $this->connection = Integration::query()->create([
        'provider' => 'salla',
        'external_account_id' => (string) E2E_MERCHANT,
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => 'a-live-token',
    ]);
});

/** @param array<string, mixed> $order */
function deliverOrder(array $order, string $event = 'order.created', int $merchant = E2E_MERCHANT)
{
    $body = (string) json_encode([
        'event' => $event,
        'merchant' => $merchant,
        'created_at' => 'Sun Jun 26 2026 12:21:48 GMT+0300',
        'data' => $order,
    ]);

    return test()->call(
        'POST',
        '/api/v1/webhooks/salla',
        server: [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_X_SALLA_SIGNATURE' => hash_hmac('sha256', $body, E2E_SECRET),
        ],
        content: $body,
    );
}

/** @return array<string, mixed> */
function liveOrder(array $overrides = []): array
{
    return array_replace([
        'id' => 2116149737,
        'reference_id' => 41027662,
        'date' => ['date' => '2026-06-26 12:21:45.000000', 'timezone' => 'Asia/Riyadh'],
        'status' => ['slug' => 'completed'],
        'payment_method' => 'mada',
        'payment_methods' => [['amount' => 196, 'payment_method' => 'mada']],
        'currency' => 'SAR',
        'amounts' => [
            'sub_total' => ['amount' => 186],
            'shipping_cost' => ['amount' => 15],
            'tax' => ['amount' => ['amount' => 0]],
            'discounts' => [['discount' => '5.00']],
            'total' => ['amount' => 196],
        ],
        'customer' => ['id' => 225167971, 'first_name' => 'Mohammed', 'last_name' => 'Ali', 'mobile' => 501806978, 'mobile_code' => '+966'],
        'items' => [[
            'name' => 'بيتزا',
            'sku' => 'PIZZA-1',
            'quantity' => 2,
            'amounts' => ['price_without_tax' => ['amount' => 186], 'total_discount' => ['amount' => 5]],
            'product' => ['id' => 720881993, 'sku' => 'PIZZA-1', 'name' => 'بيتزا', 'price' => ['amount' => 66]],
        ]],
    ], $overrides);
}

it('turns a signed delivery into an order in the right business', function (): void {
    deliverOrder(liveOrder())->assertStatus(202);

    $order = Order::query()->firstOrFail();

    expect($order->business_id)->toBe(CurrentBusiness::get()->id())
        ->and($order->source)->toBe('salla')
        ->and($order->external_id)->toBe('2116149737')
        ->and($order->status)->toBe(OrderStatus::Fulfilled)
        ->and($order->total_amount)->toBe('196.000')
        ->and($order->items()->count())->toBe(1);

    // And the receipt says it was handled, rather than merely received.
    $receipt = WebhookReceipt::query()->firstOrFail();

    expect($receipt->processed_at)->not->toBeNull()
        ->and($receipt->error)->toBeNull();
});

it('follows an order through its life without duplicating it', function (): void {
    // The sequence a real store produces: placed, worked, delivered.
    deliverOrder(liveOrder(['status' => ['slug' => 'under_review']]))->assertStatus(202);
    deliverOrder(liveOrder(['status' => ['slug' => 'in_progress']]), 'order.updated')->assertStatus(202);
    deliverOrder(liveOrder(['status' => ['slug' => 'completed']]), 'order.status.updated')->assertStatus(202);

    expect(Order::query()->count())->toBe(1)
        ->and(Order::query()->firstOrFail()->status)->toBe(OrderStatus::Fulfilled);
});

it('turns a cancellation into a cancellation, not a sale', function (): void {
    deliverOrder(liveOrder())->assertStatus(202);
    deliverOrder(liveOrder(['status' => ['slug' => 'canceled']]), 'order.status.updated')->assertStatus(202);

    $order = Order::query()->firstOrFail();

    expect($order->status)->toBe(OrderStatus::Cancelled)
        ->and(Order::query()->whereIn('status', OrderStatus::qualifying())->count())->toBe(0);
});

it('does not hand one business a delivery from another store', function (): void {
    /*
     * The store is matched from the verified payload, and a merchant id no
     * business has connected belongs to nobody. The delivery is kept with
     * its reason rather than filed under whoever happened to be first.
     */
    deliverOrder(liveOrder(), merchant: 999999999)->assertStatus(202);

    expect(Order::query()->withoutGlobalScope(BusinessScope::class)->count())->toBe(0);

    $receipt = WebhookReceipt::query()->firstOrFail();

    expect($receipt->business_id)->toBeNull()
        ->and($receipt->error)->toContain('No connected business');
});

it('keeps a forged delivery out, however well-formed the order inside it is', function (): void {
    $body = (string) json_encode(['event' => 'order.created', 'merchant' => E2E_MERCHANT, 'data' => liveOrder()]);

    $this->call(
        'POST',
        '/api/v1/webhooks/salla',
        server: ['CONTENT_TYPE' => 'application/json', 'HTTP_X_SALLA_SIGNATURE' => 'not-the-signature'],
        content: $body,
    )->assertStatus(401);

    expect(Order::query()->count())->toBe(0);
});

it('leaves a receipt an operator can act on when an order cannot be read', function (): void {
    /*
     * The queue is driven by hand here. Under the test queue a dispatch runs
     * inline, so a handler that throws comes back as a 500 from a request
     * that in production answers 202 and fails later in a worker. What a
     * worker would see is the thing worth asserting.
     */
    Queue::fake();

    // A custom status the importer has not been taught.
    deliverOrder(liveOrder(['status' => ['slug' => 'ready_for_pickup']]))->assertStatus(202);

    $receipt = WebhookReceipt::query()->firstOrFail();

    expect(fn () => (new ProcessWebhookReceipt($receipt->id, $receipt->business_id))
        ->handle(app(WebhookProviders::class)))
        ->toThrow(RuntimeException::class, 'ready_for_pickup');

    $receipt->refresh();

    expect($receipt->processed_at)->toBeNull()
        ->and($receipt->error)->toContain('ready_for_pickup')
        ->and(Order::query()->count())->toBe(0);
});
