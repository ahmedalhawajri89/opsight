<?php

declare(strict_types=1);

use App\Domain\Integrations\Connector;
use App\Domain\Integrations\Connectors;
use App\Models\Integration;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Support\Facades\Http;

/*
|--------------------------------------------------------------------------
| One connector contract (ADR-037)
|--------------------------------------------------------------------------
|
| Salla was moved onto the contract with every one of its own suites left
| untouched, and they are the main evidence the move changed nothing. This
| file covers what the contract added: the registry, the provider-neutral
| command, and one rule the shared writer must keep for every store.
|
*/

/** A Salla order with exactly the fields this file reads. */
function contractOrder(array $overrides = []): array
{
    return array_replace([
        'id' => 5550001,
        'date' => ['date' => '2026-06-26 12:21:45.000000', 'timezone' => 'Asia/Riyadh'],
        'status' => ['slug' => 'completed'],
        'payment_methods' => [['amount' => 100, 'payment_method' => 'mada']],
        'amounts' => [
            'sub_total' => ['amount' => 100],
            'total' => ['amount' => 100],
        ],
        'items' => [[
            'name' => 'Lamp',
            'sku' => 'LAMP-1',
            'quantity' => 2,
            'amounts' => ['price_without_tax' => ['amount' => 100]],
            'product' => ['id' => 77, 'sku' => 'LAMP-1', 'name' => 'Lamp'],
        ]],
    ], $overrides);
}

it('registers every connector under the name it imports as', function (): void {
    $connectors = app(Connectors::class);

    expect($connectors->names())->not->toBeEmpty();

    foreach ($connectors->names() as $name) {
        $connector = $connectors->get($name);

        /*
         * The key and the provider must agree: the key is what an operator
         * types, the provider is the `source` written on every record. If
         * they differed, `opsight:import x` would write rows that the
         * connection lookup for `x` never finds again.
         */
        expect($connector)->toBeInstanceOf(Connector::class)
            ->and($connector?->provider())->toBe($name);
    }
});

it('answers null for a provider nobody registered', function (): void {
    expect(app(Connectors::class)->get('nonexistent'))->toBeNull();
});

it('imports through the provider-neutral command, catalogue first', function (): void {
    Integration::query()->create([
        'provider' => 'salla',
        'external_account_id' => '888',
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => 'a-live-token',
        'token_expires_at' => now()->addWeek(),
    ]);

    Http::fake([
        'https://api.salla.dev/admin/v2/products*' => Http::response([
            'data' => [['id' => 77, 'sku' => 'LAMP-1', 'name' => 'Lamp', 'price' => ['amount' => 60], 'cost_price' => '20']],
            'pagination' => ['currentPage' => 1, 'totalPages' => 1, 'total' => 1],
        ]),
        'https://api.salla.dev/admin/v2/orders*' => Http::response([
            'data' => [contractOrder()],
            'pagination' => ['currentPage' => 1, 'totalPages' => 1, 'total' => 1],
        ]),
    ]);

    $this->artisan('opsight:import', ['provider' => 'salla', 'from' => '2026-06-01', 'to' => '2026-06-30'])
        ->expectsOutputToContain('1 products, 1 orders')
        ->assertSuccessful();

    $order = Order::query()->where('source', 'salla')->sole();

    /*
     * The catalogue ran first, so the line carries the product's cost rather
     * than the zero a product first seen through an order would have.
     */
    expect($order->items()->sole()->unit_cost)->toBe('20.0000')
        ->and($order->cogs_amount)->toBe('40.000')
        ->and(Product::query()->where('sku', 'LAMP-1')->count())->toBe(1);
});

it('refuses a provider nobody registered, and names the ones that are', function (): void {
    $this->artisan('opsight:import', ['provider' => 'nonexistent', 'from' => '2026-06-01', 'to' => '2026-06-30'])
        ->expectsOutputToContain("No connector is registered as 'nonexistent'. Registered: salla.")
        ->assertFailed();
});
