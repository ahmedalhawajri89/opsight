<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Integrations\WooCommerce\WooClient;
use App\Models\Integration;
use App\Models\Order;
use App\Models\User;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Testing\TestResponse;

/*
|--------------------------------------------------------------------------
| WooCommerce as real stores are set up (2026-11-14)
|--------------------------------------------------------------------------
| Plain permalinks, hosts that strip the key's header, firewalls in front of
| WordPress, a WordPress without WooCommerce, an address typed bare.
*/

const WAY_URL = 'https://ways.example.test';

beforeEach(function (): void {
    config(['integrations.woocommerce.allow_private_hosts' => true]);
    Queue::fake();
});

function wayKey(): string
{
    return 'ck_'.str_repeat('k', 40);
}

function waySecret(): string
{
    return 'cs_'.str_repeat('s', 40);
}

function connectWay(string $url = WAY_URL): TestResponse
{
    return test()->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson('/api/v1/integrations/woocommerce', ['url' => $url, 'consumer_key' => wayKey(), 'consumer_secret' => waySecret()]);
}

function wayOrder(int $id): array
{
    return [
        'id' => $id, 'number' => (string) $id, 'status' => 'completed',
        'date_created_gmt' => now()->subDay()->utc()->format('Y-m-d\TH:i:s'),
        'line_items' => [], 'discount_total' => '0', 'shipping_total' => '0', 'total_tax' => '0', 'total' => '4.000',
    ];
}

/** What a request asked for, whichever route it took. */
function wayRoute(Request $request): string
{
    parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

    return isset($query['rest_route']) ? 'query:'.$query['rest_route'] : 'pretty:'.(string) parse_url($request->url(), PHP_URL_PATH);
}

it('finds a store left on plain permalinks, and keeps asking it that way', function (): void {
    Http::fake(function (Request $request) {
        $route = wayRoute($request);

        return match (true) {
            // Plain permalinks: /wp-json/ is just a page of the theme.
            str_starts_with($route, 'pretty:') => Http::response('<html>Not found</html>', 404),
            $route === 'query:/wc/v3/orders' => Http::response([wayOrder(801)], 200, ['X-WP-TotalPages' => '1']),
            $route === 'query:/' => Http::response(['name' => 'Plain Shop']),
            default => Http::response([], 200, ['X-WP-TotalPages' => '1']),
        };
    });

    connectWay()->assertCreated()->assertJsonPath('data.store_name', 'Plain Shop');

    $connection = Integration::query()->firstOrFail();

    expect(WooClient::wayOf($connection))->toBe([WooClient::ROUTE_QUERY, WooClient::AUTH_HEADER]);

    $connection->forceFill(['last_synced_at' => now()->subHour()])->save();
    $this->artisan('integrations:sync')->assertSuccessful();

    expect(Order::query()->where('source', 'woocommerce')->count())->toBe(1);
});

it('sends the key in the address where the host strips the header, and only there', function (): void {
    Http::fake(function (Request $request) {
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
        $inAddress = isset($query['consumer_key']);

        if ($request->hasHeader('Authorization') && ! $inAddress) {
            // The header never reached WordPress: it sees nobody at all.
            return Http::response(['code' => 'woocommerce_rest_cannot_view', 'message' => 'Sorry, you cannot list resources.'], 401);
        }

        return str_contains($request->url(), '/wc/v3/orders')
            ? Http::response([wayOrder(901)], 200, ['X-WP-TotalPages' => '1'])
            : Http::response(['name' => 'Shared Host Shop']);
    });

    connectWay()->assertCreated();

    expect(WooClient::wayOf(Integration::query()->firstOrFail()))->toBe([WooClient::ROUTE_PRETTY, WooClient::AUTH_QUERY]);
});

it('says a firewall in front of the store is what stopped it, beside the address', function (): void {
    Http::fake(fn () => Http::response('<html>Access denied by security policy</html>', 403));

    connectWay()
        ->assertUnprocessable()
        ->assertJsonPath('errors.url.0', __('errors.integrations.woo_blocked'));
});

it('says WordPress without WooCommerce is that, not a wrong key', function (): void {
    Http::fake(fn () => Http::response(['code' => 'rest_no_route', 'message' => 'No route was found matching the URL and request method.'], 404));

    connectWay()
        ->assertUnprocessable()
        ->assertJsonPath('errors.url.0', __('errors.integrations.woo_no_woocommerce'));
});

it('reads an address typed without https as its https address', function (): void {
    Http::fake([
        WAY_URL.'/wp-json/wc/v3/orders*' => Http::response([], 200, ['X-WP-TotalPages' => '1']),
        WAY_URL.'/wp-json/wc/v3/products*' => Http::response([], 200, ['X-WP-TotalPages' => '1']),
        WAY_URL.'/wp-json/' => Http::response(['name' => 'Bare']),
    ]);

    connectWay('ways.example.test')->assertCreated()->assertJsonPath('data.store_id', WAY_URL);
});

it('refuses a store without https, saying why', function (): void {
    config(['integrations.woocommerce.allow_private_hosts' => false]);
    Http::fake();

    connectWay('http://ways.example.com')
        ->assertUnprocessable()
        ->assertJsonPath('errors.url.0', __('errors.integrations.woo_plain_http'));

    Http::assertNothingSent();
});

it('keeps a key sent in the address out of the error the owner and the log see', function (): void {
    Http::fake(fn () => throw new ConnectionException('cURL error 28 for https://ways.example.test/?consumer_key='.wayKey()));

    Integration::query()->create([
        'provider' => 'woocommerce',
        'external_account_id' => WAY_URL,
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => wayKey(),
        'refresh_token' => waySecret(),
        'scopes' => ['read', 'rest:pretty', 'auth:query'],
        'last_synced_at' => now()->subHour(),
    ]);

    $this->artisan('integrations:sync')->assertSuccessful();

    expect((string) Integration::query()->firstOrFail()->last_error)->not->toContain(wayKey());
});
