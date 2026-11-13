<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Business;
use App\Models\Customer;
use App\Models\Integration;
use App\Models\Order;
use App\Models\User;
use App\Support\Tenancy\BusinessScope;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;

/*
|--------------------------------------------------------------------------
| Several stores on one platform (2026-11-13)
|--------------------------------------------------------------------------
| One business may connect as many stores as it runs, on any platform. One
| store still belongs to one business only.
*/

const NORTH = 'https://north.example.test';
const SOUTH = 'https://south.example.test';

beforeEach(function (): void {
    config(['integrations.woocommerce.allow_private_hosts' => true]);
});

/** The same order number, 501, as two unrelated shops both have it. */
function fakeTwoShops(): void
{
    $order = fn (string $total) => [
        'id' => 501,
        'number' => '501',
        'status' => 'completed',
        'date_created_gmt' => now()->subDays(2)->utc()->format('Y-m-d\TH:i:s'),
        'customer_id' => 7,
        'billing' => ['first_name' => 'Huda', 'last_name' => 'Saleh', 'email' => 'huda@example.test'],
        'line_items' => [['product_id' => 11, 'sku' => null, 'name' => 'Karak tea', 'quantity' => 1, 'subtotal' => $total, 'total' => $total]],
        'discount_total' => '0',
        'shipping_total' => '0',
        'total_tax' => '0',
        'total' => $total,
        'payment_method' => 'cod',
    ];

    Http::fake([
        NORTH.'/wp-json/wc/v3/orders*' => Http::response([$order('5.000')], 200, ['X-WP-TotalPages' => '1']),
        SOUTH.'/wp-json/wc/v3/orders*' => Http::response([$order('9.000')], 200, ['X-WP-TotalPages' => '1']),
        '*/wp-json/wc/v3/products*' => Http::response([], 200, ['X-WP-TotalPages' => '1']),
        NORTH.'/wp-json/' => Http::response(['name' => 'North']),
        SOUTH.'/wp-json/' => Http::response(['name' => 'South']),
    ]);
}

function connectWoo(string $url): Integration
{
    return Integration::query()->create([
        'provider' => 'woocommerce',
        'external_account_id' => $url,
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => 'ck_'.str_repeat('a', 40),
        'refresh_token' => 'cs_'.str_repeat('b', 40),
        'last_synced_at' => now()->subHour(),
    ]);
}

it('connects a second store on the same platform beside the first', function (): void {
    Queue::fake();
    fakeTwoShops();
    $owner = User::factory()->role(Role::Owner)->create();

    foreach ([NORTH, SOUTH] as $url) {
        $this->actingAs($owner)->postJson('/api/v1/integrations/woocommerce', [
            'url' => $url,
            'consumer_key' => 'ck_'.str_repeat('a', 40),
            'consumer_secret' => 'cs_'.str_repeat('b', 40),
        ])->assertCreated();
    }

    expect(Integration::query()->where('provider', 'woocommerce')->pluck('external_account_id')->sort()->values()->all())
        ->toBe([NORTH, SOUTH]);

    $this->actingAs($owner)->getJson('/api/v1/integrations')
        ->assertOk()
        ->assertJsonCount(2, 'data')
        ->assertJsonFragment(['store_id' => NORTH, 'store_name' => 'North'])
        ->assertJsonFragment(['store_id' => SOUTH, 'store_name' => 'South']);
});

it('keeps the same order number from two shops as two orders, and does not double either', function (): void {
    fakeTwoShops();
    connectWoo(NORTH);
    connectWoo(SOUTH);

    $this->artisan('integrations:sync')->assertSuccessful();
    $this->artisan('integrations:sync')->assertSuccessful();

    $orders = Order::query()->where('source', 'woocommerce')->get();

    expect($orders)->toHaveCount(2)
        ->and($orders->pluck('total_amount')->map(fn ($v) => (string) $v)->sort()->values()->all())->toBe(['5.000', '9.000'])
        ->and($orders->pluck('external_id')->unique())->toHaveCount(2)
        // The same buyer in both shops is one customer, with both orders.
        ->and(Customer::query()->count())->toBe(1)
        ->and($orders->pluck('customer_id')->unique())->toHaveCount(1)
        ->and(Integration::query()->whereNotNull('last_error')->count())->toBe(0);
});

it('still lets one store belong to one business only, down to the database', function (): void {
    connectWoo(NORTH);

    $other = Business::factory()->create();

    expect(fn () => Integration::query()->withoutGlobalScope(BusinessScope::class)->create([
        'business_id' => $other->id,
        'provider' => 'woocommerce',
        'external_account_id' => NORTH,
        'status' => Integration::STATUS_CONNECTED,
    ]))->toThrow(UniqueConstraintViolationException::class);
});
