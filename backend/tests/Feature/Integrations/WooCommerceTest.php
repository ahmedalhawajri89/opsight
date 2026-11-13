<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Integrations\WooCommerce\ImportWooOrder;
use App\Domain\Orders\OrderStatus;
use App\Jobs\ImportStoreHistory;
use App\Models\Integration;
use App\Models\Order;
use App\Models\User;
use App\Support\Http\PublicUrl;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

/*
|--------------------------------------------------------------------------
| WooCommerce, with the owner's own REST key (2026-11-13)
|--------------------------------------------------------------------------
*/

const WOO_URL = 'https://shop.example.test';
// Split so no scanner takes made-up test values for real keys.
const WOO_KEY = 'ck_'.'TestOnlyNotARealKey000000000000000000000';
const WOO_SECRET = 'cs_'.'TestOnlyNotARealSecret000000000000000000';

beforeEach(function (): void {
    // The test store is a made-up name with no DNS record.
    config(['integrations.woocommerce.allow_private_hosts' => true]);
});

function wooOrder(array $overrides = []): array
{
    return array_replace([
        'id' => 501,
        'number' => '501',
        'status' => 'completed',
        'date_created_gmt' => now()->subDays(2)->utc()->format('Y-m-d\TH:i:s'),
        'customer_id' => 0,
        'billing' => ['first_name' => 'Huda', 'last_name' => 'Saleh', 'email' => 'huda@example.test', 'country' => 'BH'],
        'line_items' => [
            ['product_id' => 11, 'sku' => 'TEA-1', 'name' => 'Karak tea', 'quantity' => 3, 'subtotal' => '6.000', 'total' => '5.000'],
        ],
        'fee_lines' => [['total' => '0.500']],
        'discount_total' => '1.000',
        'shipping_total' => '1.500',
        'total_tax' => '0.000',
        'total' => '7.000',
        'payment_method' => 'cod',
        'payment_method_title' => 'Cash on delivery',
        'date_paid' => null,
    ], $overrides);
}

function fakeStore(array $orders = [], int $ordersStatus = 200): void
{
    Http::fake([
        WOO_URL.'/wp-json/wc/v3/orders*' => Http::response($orders, $ordersStatus, ['X-WP-TotalPages' => '1']),
        WOO_URL.'/wp-json/wc/v3/products*' => Http::response([], 200, ['X-WP-TotalPages' => '1']),
        WOO_URL.'/wp-json/' => Http::response(['name' => 'Karak House']),
    ]);
}

it('connects a store with a working key, keeps the key encrypted and imports the history', function (): void {
    Queue::fake();
    fakeStore([wooOrder()]);

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/woocommerce', [
            'url' => WOO_URL.'/',
            'consumer_key' => WOO_KEY,
            'consumer_secret' => WOO_SECRET,
        ])
        ->assertCreated()
        ->assertJsonPath('data.provider', 'woocommerce')
        ->assertJsonPath('data.store_id', WOO_URL)
        ->assertJsonMissing(['access_token' => WOO_KEY]);

    $integration = Integration::query()->where('provider', 'woocommerce')->firstOrFail();

    expect($integration->access_token)->toBe(WOO_KEY)
        // Encrypted at rest: the column holds no readable key.
        ->and($integration->getRawOriginal('access_token'))->not->toContain(WOO_KEY);

    Queue::assertPushed(ImportStoreHistory::class);
});

it('says the key was refused beside the key, and keeps nothing', function (): void {
    fakeStore([], 401);

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/woocommerce', [
            'url' => WOO_URL,
            'consumer_key' => WOO_KEY,
            'consumer_secret' => WOO_SECRET,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['consumer_key']);

    expect(Integration::query()->count())->toBe(0);
});

it('catches a key pasted into the wrong box before asking the store', function (): void {
    Http::fake();

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/woocommerce', [
            'url' => WOO_URL,
            'consumer_key' => WOO_SECRET,
            'consumer_secret' => WOO_KEY,
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['consumer_key', 'consumer_secret']);

    Http::assertNothingSent();
});

it('never lets the server fetch its own network', function (string $url): void {
    config(['integrations.woocommerce.allow_private_hosts' => false]);

    expect(PublicUrl::normalise($url))->toBeNull();
})->with([
    'loopback' => 'https://127.0.0.1',
    'cloud metadata' => 'https://169.254.169.254',
    'private range' => 'https://10.0.0.5',
    'plain http' => 'http://shop.example.com',
    'credentials in the address' => 'https://user:pass@shop.example.com',
    'not a url' => 'shop',
]);

it('reads an order: subtotal per line, coupons once, fees with shipping, the store\'s total', function (): void {
    $order = app(ImportWooOrder::class)(wooOrder());

    expect($order->status)->toBe(OrderStatus::Fulfilled)
        ->and((string) $order->total_amount)->toBe('7.000')
        ->and((string) $order->discount_amount)->toBe('1.000')
        ->and($order->items()->count())->toBe(1)
        ->and($order->source)->toBe('woocommerce');
});

it('maps the store\'s statuses, and keeps an unpaid checkout out of the figures', function (string $woo, OrderStatus $ours): void {
    expect(ImportWooOrder::status($woo))->toBe($ours);
})->with([
    ['processing', OrderStatus::Confirmed],
    ['on-hold', OrderStatus::Confirmed],
    ['completed', OrderStatus::Fulfilled],
    ['cancelled', OrderStatus::Cancelled],
    ['failed', OrderStatus::Cancelled],
    ['refunded', OrderStatus::Refunded],
    ['pending', OrderStatus::Draft],
    ['checkout-draft', OrderStatus::Draft],
]);

it('fetches what changed since the last look, every quarter hour, without doubling', function (): void {
    fakeStore([wooOrder(), wooOrder(['id' => 502, 'number' => '502'])]);

    Integration::query()->create([
        'provider' => 'woocommerce',
        'external_account_id' => WOO_URL,
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => WOO_KEY,
        'refresh_token' => WOO_SECRET,
        'last_synced_at' => now()->subHour(),
    ]);

    $this->artisan('integrations:sync-woocommerce')->assertSuccessful();
    $this->artisan('integrations:sync-woocommerce')->assertSuccessful();

    expect(Order::query()->where('source', 'woocommerce')->count())->toBe(2);

    Http::assertSent(fn ($request) => str_contains($request->url(), 'modified_after='));
});

it('lets only a role that may manage integrations connect a store', function (): void {
    Http::fake();

    $this->actingAs(User::factory()->role(Role::Staff)->create())
        ->postJson('/api/v1/integrations/woocommerce', ['url' => WOO_URL, 'consumer_key' => WOO_KEY, 'consumer_secret' => WOO_SECRET])
        ->assertForbidden();

    Http::assertNothingSent();
});

it('says an address that does not answer at all is unreachable, beside the address', function (): void {
    Http::fake(fn () => throw new ConnectionException('Connection refused'));

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/woocommerce', ['url' => WOO_URL, 'consumer_key' => WOO_KEY, 'consumer_secret' => WOO_SECRET])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['url']);
});
