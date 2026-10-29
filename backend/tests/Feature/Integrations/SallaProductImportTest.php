<?php

declare(strict_types=1);

use App\Domain\Integrations\Salla\ImportSallaOrder;
use App\Domain\Integrations\Salla\ImportSallaProduct;
use App\Models\Integration;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Support\Facades\Http;

/*
|--------------------------------------------------------------------------
| The one field an order cannot carry (ADR-030)
|--------------------------------------------------------------------------
|
| An order's payload has everything about a product except what it cost, so
| every product created from an order starts at zero and the business sees
| revenue with no margin. Salla holds it as `cost_price` on the product, and
| this is the pass that fetches it.
|
*/

const PRODUCTS_URL = 'https://api.salla.dev/admin/v2/products*';

const SALLA_ORDERS_URL = 'https://api.salla.dev/admin/v2/orders*';

beforeEach(function (): void {
    $this->connection = Integration::query()->create([
        'provider' => 'salla',
        'external_account_id' => '1305146709',
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => 'a-live-token',
        'token_expires_at' => now()->addWeek(),
    ]);
});

/** A product as Salla returns it: price nested, cost_price plain. */
function sallaProduct(array $overrides = []): array
{
    return array_replace([
        'id' => 1672932878,
        'sku' => 'TSHIRT-1',
        'name' => 'T-Shirt',
        'status' => 'sale',
        'price' => ['amount' => 100, 'currency' => 'SAR'],
        'cost_price' => '35',
    ], $overrides);
}

function importProduct(array $overrides = []): ?Product
{
    return app(ImportSallaProduct::class)(sallaProduct($overrides));
}

/*
|--------------------------------------------------------------------------
| The cost
|--------------------------------------------------------------------------
*/

it('gives an imported product the cost Salla holds', function (): void {
    $product = importProduct();

    expect($product->cost)->toBe('35.0000')
        ->and($product->price)->toBe('100.0000')
        ->and($product->source)->toBe('salla')
        ->and($product->external_id)->toBe('1672932878');
});

it('reads cost_price as the plain number Salla sends, not a nested amount', function (): void {
    // Prices are {amount, currency}; cost_price is not, and reading it as
    // one would leave every margin at zero while looking like it worked.
    expect(importProduct(['cost_price' => 42])->cost)->toBe('42.0000')
        ->and(importProduct(['id' => 2, 'sku' => 'B', 'cost_price' => '7.5'])->cost)->toBe('7.5000');
});

it('will not wipe a cost the owner typed when Salla has none', function (): void {
    /*
     * A merchant who never filled in cost_price sends null or zero.
     * Overwriting with that would silently erase the margin on products the
     * owner had already priced — the exact harm this class exists to undo.
     */
    $priced = Product::factory()->create(['sku' => 'TSHIRT-1', 'cost' => '20.0000']);

    importProduct(['cost_price' => null]);
    expect($priced->fresh()->cost)->toBe('20.0000');

    importProduct(['cost_price' => 0]);
    expect($priced->fresh()->cost)->toBe('20.0000');

    importProduct(['cost_price' => '']);
    expect($priced->fresh()->cost)->toBe('20.0000');
});

it('does update a cost Salla does know', function (): void {
    $priced = Product::factory()->create(['sku' => 'TSHIRT-1', 'cost' => '20.0000']);

    importProduct(['cost_price' => '31.5']);

    expect($priced->fresh()->cost)->toBe('31.5000');
});

/*
|--------------------------------------------------------------------------
| Matching what is already here
|--------------------------------------------------------------------------
*/

it('adopts a product entered here by hand, rather than making a second copy', function (): void {
    $existing = Product::factory()->create(['sku' => 'TSHIRT-1', 'name' => 'Our own name']);

    $imported = importProduct();

    expect(Product::query()->count())->toBe(1)
        ->and($imported->id)->toBe($existing->id)
        ->and($imported->external_id)->toBe('1672932878')
        ->and($imported->cost)->toBe('35.0000');
});

it('updates the one product however many times it is imported', function (): void {
    importProduct();
    importProduct(['name' => 'T-Shirt, renamed', 'cost_price' => '36']);

    expect(Product::query()->count())->toBe(1);

    $product = Product::query()->firstOrFail();

    expect($product->name)->toBe('T-Shirt, renamed')
        ->and($product->cost)->toBe('36.0000');
});

it('hides a product the store has hidden', function (): void {
    expect(importProduct(['status' => 'hidden'])->is_active)->toBeFalse()
        ->and(importProduct(['id' => 9, 'sku' => 'OTHER', 'status' => 'sale'])->is_active)->toBeTrue();
});

it('ignores a product with nothing to identify it by', function (): void {
    expect(app(ImportSallaProduct::class)(['name' => 'Nameless']))->toBeNull()
        ->and(Product::query()->count())->toBe(0);
});

/*
|--------------------------------------------------------------------------
| Through the backfill, which is where it matters
|--------------------------------------------------------------------------
*/

it('imports the catalogue before the orders, so every line has a margin', function (): void {
    /*
     * The order of the two passes is the whole point. An order importing
     * first would create its products at cost zero, and the catalogue pass
     * would then be correcting rather than preventing.
     */
    Http::fake([
        PRODUCTS_URL => Http::response([
            'data' => [sallaProduct(['id' => 777, 'sku' => 'W-1', 'name' => 'Widget', 'cost_price' => '8'])],
            'pagination' => ['currentPage' => 1, 'totalPages' => 1, 'total' => 1],
        ]),
        SALLA_ORDERS_URL => Http::response([
            'data' => [[
                'id' => 5001,
                'date' => ['date' => '2026-06-26 12:00:00.000000', 'timezone' => 'Asia/Riyadh'],
                'status' => ['slug' => 'completed'],
                'currency' => 'SAR',
                'amounts' => ['sub_total' => ['amount' => 20], 'total' => ['amount' => 20]],
                'items' => [[
                    'name' => 'Widget',
                    'sku' => 'W-1',
                    'quantity' => 1,
                    'amounts' => ['price_without_tax' => ['amount' => 20]],
                    'product' => ['id' => 777, 'sku' => 'W-1', 'name' => 'Widget'],
                ]],
            ]],
            'pagination' => ['currentPage' => 1, 'totalPages' => 1, 'total' => 1],
        ]),
    ]);

    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])
        ->assertSuccessful();

    $product = Product::query()->firstOrFail();

    expect($product->cost)->toBe('8.0000')
        ->and(Order::query()->count())->toBe(1)
        // The product the order line points at is the one the catalogue
        // pass created, not a second copy made at cost zero.
        ->and(Order::query()->firstOrFail()->items()->first()->product_id)->toBe($product->id);
});

it('carries the cost onto the order line, so the margin is real', function (): void {
    /*
     * The end this whole pass exists for: an imported order with a gross
     * profit, not revenue with a hole where the cost should be.
     */
    importProduct(['id' => 777, 'sku' => 'W-1', 'name' => 'Widget', 'cost_price' => '8']);

    $order = app(ImportSallaOrder::class)([
        'id' => 5002,
        'date' => ['date' => '2026-06-26 12:00:00.000000', 'timezone' => 'Asia/Riyadh'],
        'status' => ['slug' => 'completed'],
        'amounts' => ['sub_total' => ['amount' => 60], 'total' => ['amount' => 60]],
        'items' => [[
            'name' => 'Widget',
            'sku' => 'W-1',
            'quantity' => 3,
            'amounts' => ['price_without_tax' => ['amount' => 60]],
            'product' => ['id' => 777, 'sku' => 'W-1'],
        ]],
    ]);

    $item = $order->items()->firstOrFail();

    expect($item->unit_cost)->toBe('8.0000')
        // Three at eight.
        ->and($order->cogs_amount)->toBe('24.000')
        // And a gross profit that is sixty less twenty-four.
        ->and(bcsub($order->total_amount, $order->cogs_amount, 3))->toBe('36.000');
});

it('records an unknown margin as unknown, not as total profit', function (): void {
    // A product the catalogue pass has not reached yet. Zero cost reads as
    // "we do not know", and re-importing after it catches up fills it in.
    $order = app(ImportSallaOrder::class)([
        'id' => 5003,
        'date' => ['date' => '2026-06-26 12:00:00.000000', 'timezone' => 'Asia/Riyadh'],
        'status' => ['slug' => 'completed'],
        'amounts' => ['sub_total' => ['amount' => 60], 'total' => ['amount' => 60]],
        'items' => [[
            'name' => 'Unpriced',
            'sku' => 'U-1',
            'quantity' => 1,
            'amounts' => ['price_without_tax' => ['amount' => 60]],
            'product' => ['id' => 888, 'sku' => 'U-1'],
        ]],
    ]);

    expect($order->cogs_amount)->toBe('0.000');

    // The catalogue catches up, and a re-import fills the margin in.
    importProduct(['id' => 888, 'sku' => 'U-1', 'name' => 'Unpriced', 'cost_price' => '15']);

    $again = app(ImportSallaOrder::class)([
        'id' => 5003,
        'date' => ['date' => '2026-06-26 12:00:00.000000', 'timezone' => 'Asia/Riyadh'],
        'status' => ['slug' => 'completed'],
        'amounts' => ['sub_total' => ['amount' => 60], 'total' => ['amount' => 60]],
        'items' => [[
            'name' => 'Unpriced',
            'sku' => 'U-1',
            'quantity' => 1,
            'amounts' => ['price_without_tax' => ['amount' => 60]],
            'product' => ['id' => 888, 'sku' => 'U-1'],
        ]],
    ]);

    expect($again->cogs_amount)->toBe('15.000');
});

it('leaves the catalogue alone when told to', function (): void {
    Http::fake([
        PRODUCTS_URL => Http::response(['data' => [sallaProduct()], 'pagination' => ['currentPage' => 1, 'totalPages' => 1, 'total' => 1]]),
        SALLA_ORDERS_URL => Http::response(['data' => [], 'pagination' => ['currentPage' => 1, 'totalPages' => 1, 'total' => 0]]),
    ]);

    $this->artisan('opsight:salla:import', [
        'from' => '2026-06-01',
        'to' => '2026-06-30',
        '--skip-products' => true,
    ])->assertSuccessful();

    expect(Product::query()->count())->toBe(0);
});
