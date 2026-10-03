<?php

declare(strict_types=1);

use App\Domain\Inventory\AdjustStock;
use App\Domain\Inventory\InsufficientStockException;
use App\Domain\Inventory\StockLedger;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Product;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| The invariant
|--------------------------------------------------------------------------
|
| stock_on_hand == SUM(quantity_delta), for every product, at all times.
|
| This is the system's integrity canary. If it ever drifts, the cached value and
| the ledger disagree and one of them is lying (ARCHITECTURE.md §7).
|
*/

function assertLedgerInvariant(): void
{
    expect(app(StockLedger::class)->findDrift())->toBeEmpty();
}

it('holds the invariant after a restock', function (): void {
    $product = Product::factory()->create();

    app(AdjustStock::class)->restock($product, 100, '12.5000');

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(100);
    assertLedgerInvariant();
});

it('holds the invariant across a mixed sequence of movements', function (): void {
    $product = Product::factory()->create();
    $adjust = app(AdjustStock::class);

    $adjust->restock($product, 100);
    $adjust->adjust($product, -8, 'Damaged in transit', InventoryMovement::REASON_DAMAGE);
    $adjust->restock($product, 25);
    $adjust->adjust($product, -3, 'Stock count correction');

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(114);
    assertLedgerInvariant();
});

it('records balance_after matching the running total at every entry', function (): void {
    $product = Product::factory()->create();
    $adjust = app(AdjustStock::class);

    $adjust->restock($product, 50);
    $adjust->adjust($product, -20, 'Sold offline');
    $adjust->restock($product, 5);

    $running = 0;

    foreach (InventoryMovement::where('product_id', $product->id)->orderBy('id')->get() as $movement) {
        $running += $movement->quantity_delta;

        // balance_after makes the ledger auditable without recomputing a sum.
        expect($movement->balance_after)->toBe($running);
    }
});

/*
|--------------------------------------------------------------------------
| Stock can never go negative
|--------------------------------------------------------------------------
*/

it('refuses an adjustment that would drive stock below zero', function (): void {
    $product = Product::factory()->withStock(5)->create();

    expect(fn () => app(AdjustStock::class)->adjust($product, -10, 'Bad count'))
        ->toThrow(InsufficientStockException::class);

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(5);
    assertLedgerInvariant();
});

it('requires a note on a manual adjustment', function (string $note): void {
    $product = Product::factory()->withStock(10)->create();

    // An unexplained stock change is indistinguishable from theft when someone
    // reviews the ledger a month later.
    expect(fn () => app(AdjustStock::class)->adjust($product, -1, $note))
        ->toThrow(InsufficientStockException::class);
})->with(['empty' => '', 'whitespace' => '   ']);

it('rejects a zero-quantity restock', function (): void {
    $product = Product::factory()->create();

    expect(fn () => app(AdjustStock::class)->restock($product, 0))
        ->toThrow(InvalidArgumentException::class);
});

/*
|--------------------------------------------------------------------------
| The ledger is append-only
|--------------------------------------------------------------------------
*/

it('never records an updated_at, because an entry is never edited', function (): void {
    $product = Product::factory()->create();

    app(AdjustStock::class)->restock($product, 10);

    expect(InventoryMovement::UPDATED_AT)->toBeNull();

    $columns = DB::getSchemaBuilder()->getColumnListing('inventory_movements');

    expect($columns)->not->toContain('updated_at')
        ->and($columns)->not->toContain('deleted_at');
});

it('records the reason and note on every movement', function (): void {
    $product = Product::factory()->create();

    app(AdjustStock::class)->adjust(
        $product,
        10,
        'Found in back room',
        InventoryMovement::REASON_ADJUSTMENT,
    );

    $movement = InventoryMovement::where('product_id', $product->id)->latest('id')->first();

    expect($movement->reason)->toBe(InventoryMovement::REASON_ADJUSTMENT)
        ->and($movement->note)->toBe('Found in back room')
        ->and($movement->reference_type)->toBe('manual');
});

it('captures the unit cost on a restock, as a basis for future valuation', function (): void {
    $product = Product::factory()->create();

    app(AdjustStock::class)->restock($product, 40, '18.7500');

    $movement = InventoryMovement::where('product_id', $product->id)->latest('id')->first();

    // ADR-014: inventory turnover is deferred, but the cost basis it will need
    // is being captured now.
    expect((float) $movement->unit_cost)->toBe(18.75);
});

it('does not change the product cost when stock is received', function (): void {
    $product = Product::factory()->priced(100.0000, 40.0000)->create();

    app(AdjustStock::class)->restock($product, 10, '55.0000');

    // Changing the catalog cost is a deliberate decision by a manager, not a
    // side effect of a delivery arriving.
    expect((float) $product->fresh()->cost)->toBe(40.0);
});

/*
|--------------------------------------------------------------------------
| Low stock
|--------------------------------------------------------------------------
*/

it('flags a product at or below its threshold', function (int $stock, int $threshold, bool $expected): void {
    $product = Product::factory()->withStock($stock)->create(['low_stock_threshold' => $threshold]);

    expect($product->inventoryItem->fresh()->isLowStock())->toBe($expected);
})->with([
    'below' => [3, 10, true],
    'exactly at' => [10, 10, true],
    'above' => [11, 10, false],
    'zero stock' => [0, 5, true],
]);
