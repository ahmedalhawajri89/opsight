<?php

declare(strict_types=1);

use App\Domain\Integrations\Zid\ZidOAuth;
use App\Domain\Integrations\Zid\ZidWebhooks;
use App\Models\Business;
use App\Models\Integration;
use App\Models\Order;
use App\Models\Product;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Testing\TestResponse;

/*
|--------------------------------------------------------------------------
| A connected Zid store, kept in step (ADR-037)
|--------------------------------------------------------------------------
|
| Three ways records arrive or stay reachable: deliveries at the door, the
| backfill, and token refresh. Zid signs nothing, so the door checks the
| Basic Auth credentials Baydar gave it — and that is what the first group is
| about.
|
*/

const ZID_SECRET = 'webhook-password';

beforeEach(function (): void {
    config([
        'integrations.secrets.zid' => ZID_SECRET,
        'integrations.zid' => array_merge((array) config('integrations.zid'), [
            'client_id' => 'zid-client', 'client_secret' => 'zid-secret', 'redirect_uri' => 'https://app.test/cb',
        ]),
    ]);

    $this->store = Integration::query()->create([
        'provider' => 'zid',
        'external_account_id' => '98765',
        'status' => Integration::STATUS_CONNECTED,
        'authorization_token' => 'the-authorization-jwt',
        'access_token' => 'the-manager-token',
        'refresh_token' => 'the-refresh-token',
        'token_expires_at' => now()->addYears(2),
        'refresh_token_expires_at' => now()->addMonths(9),
    ]);
});

function zidDelivery(array $overrides = []): array
{
    return array_replace([
        'id' => 501,
        'store_id' => 98765,
        'order_status' => ['code' => 'new'],
        'payment_status' => 'pending',
        'created_at' => '2026-06-20 10:00:00',
        'order_total' => '50.00',
        'products' => [['id' => 'p-1', 'sku' => 'MUG', 'name' => 'Mug', 'quantity' => 1, 'net_price' => 43.48]],
    ], $overrides);
}

function deliverToZidDoor(array $payload, ?string $authorization): TestResponse
{
    $headers = ['CONTENT_TYPE' => 'application/json'];

    if ($authorization !== null) {
        $headers['HTTP_AUTHORIZATION'] = $authorization;
    }

    return test()->call('POST', '/api/v1/webhooks/zid', [], [], [], $headers, (string) json_encode($payload));
}

/*
|--------------------------------------------------------------------------
| At the door
|--------------------------------------------------------------------------
*/

it('imports an order delivered with the credentials Zid was given', function (): void {
    deliverToZidDoor(zidDelivery(), ZidWebhooks::expectedHeader(ZID_SECRET, '98765'))->assertStatus(202);

    $order = Order::query()->withoutGlobalScope(BusinessScope::class)->where('source', 'zid')->sole();

    expect($order->external_id)->toBe('501')
        ->and($order->business_id)->toBe($this->store->business_id);
});

it('refuses a delivery with the wrong password, and keeps the evidence', function (): void {
    deliverToZidDoor(zidDelivery(), ZidWebhooks::expectedHeader('guessed', '98765'))->assertStatus(401);

    expect(Order::query()->withoutGlobalScope(BusinessScope::class)->where('source', 'zid')->exists())->toBeFalse()
        ->and(WebhookReceipt::query()->where('provider', 'zid')->where('signature_ok', false)->exists())->toBeTrue();
});

it('refuses a delivery with no credentials at all', function (): void {
    deliverToZidDoor(zidDelivery(), null)->assertStatus(401);
});

it('is no door at all on an installation without the secret', function (): void {
    // Exactly as for Salla: nothing set up, nothing accepting payloads.
    config(['integrations.secrets.zid' => null]);

    deliverToZidDoor(zidDelivery(), ZidWebhooks::expectedHeader(ZID_SECRET, '98765'))->assertNotFound();
});

it('answers a retry without importing it twice', function (): void {
    deliverToZidDoor(zidDelivery(), ZidWebhooks::expectedHeader(ZID_SECRET, '98765'))->assertStatus(202);
    deliverToZidDoor(zidDelivery(), ZidWebhooks::expectedHeader(ZID_SECRET, '98765'))->assertJsonPath('status', 'duplicate');

    expect(Order::query()->withoutGlobalScope(BusinessScope::class)->where('source', 'zid')->count())->toBe(1);
});

it('keeps a delivery for a store nobody connected, without acting on it', function (): void {
    deliverToZidDoor(zidDelivery(['store_id' => 11111]), ZidWebhooks::expectedHeader(ZID_SECRET, '11111'))->assertStatus(202);

    $receipt = WebhookReceipt::query()->where('provider', 'zid')->sole();

    expect($receipt->business_id)->toBeNull()
        ->and($receipt->error)->toContain('No connected business');
});

it('tells an order from a product by its shape', function (): void {
    $door = app(ZidWebhooks::class);

    expect($door->event(zidDelivery()))->toBe('order')
        ->and($door->event(['id' => 'x', 'sku' => 'MUG', 'price' => 10]))->toBe('product')
        ->and($door->event(['hello' => 'world']))->toBe('unknown');
});

/*
|--------------------------------------------------------------------------
| The backfill
|--------------------------------------------------------------------------
*/

it('imports the catalogue, then the orders, through the neutral command', function (): void {
    Http::fake([
        'https://api.zid.sa/v1/products/*' => Http::response([
            'count' => 1, 'next' => null, 'previous' => null,
            'results' => [['id' => 'p-1', 'sku' => 'MUG', 'name' => ['en' => 'Mug'], 'price' => 50, 'cost' => 12, 'structure' => 'standalone']],
        ]),
        'https://api.zid.sa/v1/managers/store/orders*' => Http::response([
            'status' => 'object', 'grand_total' => 1, 'total_order_count' => 1,
            'orders' => [zidDelivery(['payment_status' => 'paid', 'order_status' => ['code' => 'delivered']])],
        ]),
    ]);

    $this->artisan('opsight:import', ['provider' => 'zid', 'from' => '2026-06-01', 'to' => '2026-06-30'])
        ->expectsOutputToContain('1 products, 1 orders')
        ->assertSuccessful();

    $line = Order::query()->where('source', 'zid')->sole()->items()->sole();

    // The catalogue ran first, so the sale has a margin from its first import.
    expect($line->unit_cost)->toBe('12.0000')
        ->and(Product::query()->where('sku', 'MUG')->count())->toBe(1);

    Http::assertSent(fn (Request $request): bool => str_contains($request->url(), 'managers/store/orders')
        && $request['payload_type'] === 'default'
        && $request['date_from'] === '2026-06-01T00:00:00.000+0300'
        && $request->header('Store-Id')[0] === '98765');
});

it('walks every page of orders until a short one', function (): void {
    $full = array_map(fn (int $i): array => zidDelivery(['id' => $i]), range(1, 100));

    Http::fake([
        'https://api.zid.sa/v1/products/*' => Http::response(['next' => null, 'results' => []]),
        'https://api.zid.sa/v1/managers/store/orders*' => function (Request $request) use ($full) {
            return Http::response(['orders' => (int) $request['page'] === 1 ? $full : [zidDelivery(['id' => 101])]]);
        },
    ]);

    $this->artisan('opsight:import', ['provider' => 'zid', 'from' => '2026-06-01', 'to' => '2026-06-30'])
        ->assertSuccessful();

    expect(Order::query()->where('source', 'zid')->count())->toBe(101);
});

it('refuses a listing it cannot read, rather than reporting no orders', function (): void {
    Http::fake([
        'https://api.zid.sa/v1/products/*' => Http::response(['next' => null, 'results' => []]),
        'https://api.zid.sa/v1/managers/store/orders*' => Http::response(['status' => 'object']),
    ]);

    $this->artisan('opsight:import', ['provider' => 'zid', 'from' => '2026-06-01', 'to' => '2026-06-30'])
        ->expectsOutputToContain('no orders array')
        ->assertFailed();
});

/*
|--------------------------------------------------------------------------
| Staying connected
|--------------------------------------------------------------------------
*/

it('refreshes before the refresh token itself dies, and saves the whole new set', function (): void {
    /*
     * The access token is good for two more years; the refresh token has a
     * month. Waiting for the access token would lose the connection in four
     * weeks, unrecoverably.
     */
    $this->store->forceFill(['refresh_token_expires_at' => CarbonImmutable::now()->addMonth()])->save();

    Http::fake(['https://oauth.zid.sa/oauth/token' => Http::response([
        'expires_in' => 94608000, 'authorization' => 'new-auth', 'access_token' => 'new-manager', 'refresh_token' => 'new-refresh',
    ])]);

    $credentials = app(ZidOAuth::class)->credentialsFor($this->store);

    expect($credentials)->toBe(['authorization' => 'new-auth', 'manager' => 'new-manager'])
        ->and($this->store->fresh()->refresh_token)->toBe('new-refresh')
        ->and($this->store->fresh()->refresh_token_expires_at->isAfter(now()->addMonths(11)))->toBeTrue();

    Http::assertSent(fn (Request $request): bool => $request['grant_type'] === 'refresh_token'
        && $request['refresh_token'] === 'the-refresh-token');
});

it('does not refresh a connection that is not due', function (): void {
    Http::fake();

    app(ZidOAuth::class)->credentialsFor($this->store);

    Http::assertNothingSent();
});

it('marks a connection dead, with Zid\'s words, when the refresh is refused', function (): void {
    $this->store->forceFill(['refresh_token_expires_at' => CarbonImmutable::now()->addDay()])->save();

    Http::fake(['https://oauth.zid.sa/oauth/token' => Http::response(['message' => 'The refresh token is invalid.'], 401)]);

    expect(fn () => app(ZidOAuth::class)->credentialsFor($this->store))->toThrow(RuntimeException::class);

    $dead = $this->store->fresh();

    expect($dead->status)->toBe(Integration::STATUS_REVOKED)
        ->and($dead->last_error)->toBe('The refresh token is invalid.')
        ->and($dead->access_token)->toBeNull()
        ->and($dead->authorization_token)->toBeNull()
        ->and($dead->refresh_token)->toBeNull();
});

it('lets the database refuse a second business for one store', function (): void {
    $first = Business::factory()->create();
    $second = Business::factory()->create();

    $row = fn (int $business): array => [
        'business_id' => $business, 'provider' => 'zid', 'external_account_id' => 'store-42',
        'status' => 'connected', 'created_at' => now(), 'updated_at' => now(),
    ];

    DB::table('integrations')->insert($row($first->id));

    expect(fn () => DB::table('integrations')->insert($row($second->id)))
        ->toThrow(UniqueConstraintViolationException::class);
});

it('refuses a delivery naming another store than the one its password belongs to', function (): void {
    /*
     * The password from store 98765's own webhook settings, on a delivery
     * that names store 11111: the forgery a single shared password allowed.
     */
    deliverToZidDoor(zidDelivery(['store_id' => 11111]), ZidWebhooks::expectedHeader(ZID_SECRET, '98765'))
        ->assertStatus(401);
});
