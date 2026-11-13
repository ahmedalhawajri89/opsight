<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Integrations\Shopify\ConnectShopifyStore;
use App\Domain\Integrations\Shopify\ImportShopifyOrder;
use App\Domain\Integrations\Shopify\ShopifyDomain;
use App\Domain\Orders\OrderStatus;
use App\Jobs\ImportStoreHistory;
use App\Models\Integration;
use App\Models\Order;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

/*
|--------------------------------------------------------------------------
| Shopify (2026-11-13): Baydar's own app, or a token the owner already has
|--------------------------------------------------------------------------
*/

const SHOP = 'karak-house.myshopify.com';
// Split so no scanner takes a made-up test value for a real token.
const SHOP_TOKEN = 'shpat_'.'TestOnlyNotARealToken0000000000';

function shopifyOrder(array $overrides = []): array
{
    return array_replace([
        'id' => 'gid://shopify/Order/9001',
        'legacyResourceId' => '9001',
        'name' => '#1001',
        'createdAt' => now()->subDays(2)->utc()->toIso8601String(),
        'cancelledAt' => null,
        'taxesIncluded' => false,
        'displayFinancialStatus' => 'PAID',
        'displayFulfillmentStatus' => 'FULFILLED',
        'totalDiscountsSet' => ['shopMoney' => ['amount' => '1.00']],
        'totalShippingPriceSet' => ['shopMoney' => ['amount' => '2.00']],
        'totalTaxSet' => ['shopMoney' => ['amount' => '0.50']],
        'totalPriceSet' => ['shopMoney' => ['amount' => '13.50']],
        'totalOutstandingSet' => ['shopMoney' => ['amount' => '0.00']],
        'paymentGatewayNames' => ['shopify_payments'],
        'lineItems' => ['nodes' => [
            ['sku' => 'MUG-1', 'name' => 'Mug', 'quantity' => 3, 'originalUnitPriceSet' => ['shopMoney' => ['amount' => '4.00']], 'variant' => ['legacyResourceId' => '77']],
        ]],
    ], $overrides);
}

function fakeShopify(array $orders = [], int $status = 200): void
{
    Http::fake([
        'https://'.SHOP.'/admin/api/*' => function ($request) use ($orders, $status) {
            if ($status !== 200) {
                return Http::response(['errors' => 'Invalid API key or access token'], $status);
            }

            $query = $request->data()['query'] ?? '';

            if (str_contains($query, 'shop {')) {
                return Http::response(['data' => ['shop' => ['name' => 'Karak House', 'myshopifyDomain' => SHOP]]]);
            }

            if (str_contains($query, 'productVariants')) {
                return Http::response(['data' => ['productVariants' => ['pageInfo' => ['hasNextPage' => false], 'nodes' => []]]]);
            }

            return Http::response(['data' => ['orders' => ['pageInfo' => ['hasNextPage' => false], 'nodes' => $orders]]]);
        },
    ]);
}

it('reads a shop name however the owner types it, and only as a myshopify domain', function (string $typed, ?string $expected): void {
    expect(ShopifyDomain::normalise($typed))->toBe($expected);
})->with([
    ['karak-house', SHOP],
    ['Karak-House.myshopify.com', SHOP],
    ['https://karak-house.myshopify.com/admin/orders', SHOP],
    ['karakhouse.com', null],
    ['https://127.0.0.1', null],
    ['evil.com/x.myshopify.com', null],
    ['', null],
]);

it('connects a store with a token it has tried, keeps it encrypted and imports the history', function (): void {
    Queue::fake();
    fakeShopify();

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/shopify/token', ['shop' => 'karak-house', 'token' => SHOP_TOKEN])
        ->assertCreated()
        ->assertJsonPath('data.provider', 'shopify')
        ->assertJsonPath('data.store_id', SHOP);

    $integration = Integration::query()->where('provider', 'shopify')->firstOrFail();

    expect($integration->access_token)->toBe(SHOP_TOKEN)
        ->and($integration->getRawOriginal('access_token'))->not->toContain(SHOP_TOKEN);

    Queue::assertPushed(ImportStoreHistory::class);
});

it('says a refused token beside the token, and keeps nothing', function (): void {
    fakeShopify([], 401);

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/shopify/token', ['shop' => SHOP, 'token' => SHOP_TOKEN])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['token']);

    expect(Integration::query()->count())->toBe(0);
});

it('offers the app only where Baydar\'s Shopify app is set up', function (): void {
    config(['integrations.shopify.client_id' => null]);

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/shopify/authorize', ['shop' => SHOP])
        ->assertStatus(503);
});

it('sends the owner to approve Baydar in their own shop, and accepts only Shopify\'s signed answer for that session', function (): void {
    Queue::fake();
    config([
        'integrations.shopify.client_id' => 'app-id',
        'integrations.shopify.client_secret' => 'app-secret',
        'integrations.shopify.redirect_uri' => 'https://app.example/settings/integrations/shopify/callback',
    ]);
    Http::fake([
        'https://'.SHOP.'/admin/oauth/access_token' => Http::response(['access_token' => 'shpua_live', 'scope' => 'read_orders,read_products']),
    ]);

    $owner = User::factory()->role(Role::Owner)->create();
    $url = $this->actingAs($owner)->postJson('/api/v1/integrations/shopify/authorize', ['shop' => 'karak-house'])
        ->assertOk()
        ->json('data.url');

    expect($url)->toStartWith('https://'.SHOP.'/admin/oauth/authorize?');
    parse_str((string) parse_url($url, PHP_URL_QUERY), $sent);

    $answer = ['code' => 'abc', 'shop' => SHOP, 'state' => $sent['state'], 'timestamp' => (string) time()];
    $forged = $answer + ['hmac' => str_repeat('0', 64)];

    // A forged signature is refused, and the state is not spent by it.
    $this->actingAs($owner)->postJson('/api/v1/integrations/shopify/callback', $forged)
        ->assertUnprocessable();

    ksort($answer);
    $signed = $answer + ['hmac' => hash_hmac('sha256', urldecode(http_build_query($answer, '', '&', PHP_QUERY_RFC3986)), 'app-secret')];

    $this->actingAs($owner)->postJson('/api/v1/integrations/shopify/callback', $signed)->assertCreated();

    expect(Integration::query()->where('provider', 'shopify')->first()->access_token)->toBe('shpua_live');

    // The same answer again: the state is spent.
    $this->actingAs($owner)->postJson('/api/v1/integrations/shopify/callback', $signed)->assertUnprocessable();
});

it('checks Shopify\'s signature the way Shopify makes it', function (): void {
    $query = ['code' => '0907a61c0c8d55e99db179b68161bc00', 'shop' => 'some-shop.myshopify.com', 'state' => '0.6784241404160823', 'timestamp' => '1337178173'];
    ksort($query);
    $hmac = hash_hmac('sha256', 'code=0907a61c0c8d55e99db179b68161bc00&shop=some-shop.myshopify.com&state=0.6784241404160823&timestamp=1337178173', 'hush');

    expect(ConnectShopifyStore::signed($query + ['hmac' => $hmac], 'hush'))->toBeTrue()
        ->and(ConnectShopifyStore::signed($query + ['hmac' => $hmac], 'wrong'))->toBeFalse()
        ->and(ConnectShopifyStore::signed($query, 'hush'))->toBeFalse();
});

it('reads an order: lines at their price, discounts once, the shop\'s own total, what was collected', function (): void {
    $order = app(ImportShopifyOrder::class)(shopifyOrder());

    expect($order->status)->toBe(OrderStatus::Fulfilled)
        ->and((string) $order->total_amount)->toBe('13.500')
        ->and((string) $order->discount_amount)->toBe('1.000')
        ->and($order->source)->toBe('shopify');
});

it('maps Shopify\'s statuses', function (array $fields, OrderStatus $ours): void {
    expect(ImportShopifyOrder::status($fields))->toBe($ours);
})->with([
    'cancelled' => [['cancelledAt' => '2026-11-01T00:00:00Z', 'displayFulfillmentStatus' => 'FULFILLED'], OrderStatus::Cancelled],
    'refunded' => [['displayFinancialStatus' => 'REFUNDED'], OrderStatus::Refunded],
    'shipped' => [['displayFulfillmentStatus' => 'FULFILLED'], OrderStatus::Fulfilled],
    'to ship' => [['displayFulfillmentStatus' => 'UNFULFILLED'], OrderStatus::Confirmed],
]);

it('fetches what changed in Shopify since the last look, without doubling', function (): void {
    fakeShopify([shopifyOrder(), shopifyOrder(['legacyResourceId' => '9002', 'name' => '#1002'])]);

    Integration::query()->create([
        'provider' => 'shopify',
        'external_account_id' => SHOP,
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => SHOP_TOKEN,
        'last_synced_at' => now()->subHour(),
    ]);

    $this->artisan('integrations:sync')->assertSuccessful();
    $this->artisan('integrations:sync')->assertSuccessful();

    expect(Order::query()->where('source', 'shopify')->count())->toBe(2);

    Http::assertSent(fn ($request) => str_contains((string) json_encode($request->data()), 'updated_at:>='));
});

it('lets only a role that may manage integrations connect a shop', function (): void {
    Http::fake();

    $this->actingAs(User::factory()->role(Role::Staff)->create())
        ->postJson('/api/v1/integrations/shopify/token', ['shop' => SHOP, 'token' => SHOP_TOKEN])
        ->assertForbidden();

    Http::assertNothingSent();
});

it('says a shop that does not exist is unreachable, beside its name', function (): void {
    Http::fake(['https://'.SHOP.'/admin/api/*' => Http::response('Not Found', 404)]);

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/shopify/token', ['shop' => SHOP, 'token' => SHOP_TOKEN])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['shop']);
});
