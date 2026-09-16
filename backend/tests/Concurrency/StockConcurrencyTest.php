<?php

declare(strict_types=1);

use App\Domain\Inventory\AdjustStock;
use App\Domain\Inventory\InsufficientStockException;
use App\Domain\Inventory\StockLedger;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\OrderStatus;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| Stock under concurrent confirmation
|--------------------------------------------------------------------------
|
| Two users confirming the last unit at the same moment is the one place in
| Opsight where getting it wrong means selling stock that does not exist.
|
| WHAT THESE TESTS DO AND DO NOT PROVE. PHP here is single-threaded, so two
| confirms cannot literally run at the same instant inside one test process.
| Instead:
|
|   - one test proves the row lock is REAL and EXCLUSIVE, by holding it on one
|     connection and showing a second connection cannot acquire it;
|   - another proves the BUSINESS OUTCOME is right when two confirms contend for
|     the last unit: exactly one succeeds, and the invariant survives.
|
| Together those are the two halves of the claim. Stating the limit is better
| than a test that looks parallel and is not.
|
*/

function cleanupConcurrencyData(): void
{
    DB::table('inventory_movements')->delete();
    DB::table('order_items')->delete();
    DB::table('orders')->delete();
    DB::table('inventory_items')->delete();
    DB::table('products')->delete();
    DB::table('categories')->delete();
    DB::table('customers')->delete();
    DB::table('users')->where('email', 'like', '%@concurrency.test')->delete();
}

beforeEach(fn () => cleanupConcurrencyData());
afterEach(fn () => cleanupConcurrencyData());

function orderFor(Product $product, int $quantity): Order
{
    $order = Order::factory()->create(['customer_id' => null]);

    // Through the relationship: order_id is deliberately not fillable.
    $order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $product->price,
        'unit_cost' => $product->cost,
        'quantity' => $quantity,
        'line_discount' => 0,
        'line_total' => 0,
    ]);

    return $order->fresh();
}

/*
|--------------------------------------------------------------------------
| The lock is real
|--------------------------------------------------------------------------
*/

it('holds an exclusive row lock that a second connection cannot acquire', function (): void {
    $product = Product::factory()->create();
    app(AdjustStock::class)->restock($product, 10);

    // A second, independent connection to the same database.
    config(['database.connections.second' => config('database.connections.mysql')]);
    $second = DB::connection('second');

    // Fail fast instead of waiting the default 50 seconds for the lock.
    $second->statement('SET SESSION innodb_lock_wait_timeout = 1');

    DB::beginTransaction();

    try {
        // Connection one takes the lock.
        DB::table('inventory_items')
            ->where('product_id', $product->id)
            ->lockForUpdate()
            ->first();

        $secondConnectionBlocked = false;

        $second->beginTransaction();

        try {
            $second->table('inventory_items')
                ->where('product_id', $product->id)
                ->lockForUpdate()
                ->first();
        } catch (QueryException $e) {
            // 1205 = lock wait timeout. The lock did its job.
            $secondConnectionBlocked = str_contains($e->getMessage(), '1205')
                || str_contains(strtolower($e->getMessage()), 'lock wait timeout');
        } finally {
            $second->rollBack();
        }

        expect($secondConnectionBlocked)->toBeTrue(
            'A second connection acquired the lock while the first held it — stock is not protected.',
        );
    } finally {
        DB::rollBack();
        $second->disconnect();
    }
});

/*
|--------------------------------------------------------------------------
| The business outcome
|--------------------------------------------------------------------------
*/

it('lets exactly one of two orders claim the last unit', function (): void {
    $product = Product::factory()->create();
    app(AdjustStock::class)->restock($product, 1);

    // Both drafts are built while one unit is available — the situation two
    // users are in when they each open a form and then both press confirm.
    $first = orderFor($product, 1);
    $second = orderFor($product, 1);

    $confirm = app(ConfirmOrder::class);
    $succeeded = 0;
    $failed = 0;

    foreach ([$first, $second] as $order) {
        try {
            $confirm($order);
            $succeeded++;
        } catch (InsufficientStockException) {
            $failed++;
        }
    }

    expect($succeeded)->toBe(1)
        ->and($failed)->toBe(1)
        ->and(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(0);

    // And the loser is untouched — no partial state, no phantom movement.
    // status is cast to the enum, so compare against cases rather than strings.
    $statuses = Order::whereIn('id', [$first->id, $second->id])
        ->get()
        ->map(fn (Order $order): string => $order->status->value)
        ->all();

    expect($statuses)->toContain(OrderStatus::Confirmed->value)
        ->and($statuses)->toContain(OrderStatus::Draft->value);
});

it('keeps the ledger invariant intact after contention', function (): void {
    $product = Product::factory()->create();
    app(AdjustStock::class)->restock($product, 3);

    $confirm = app(ConfirmOrder::class);

    // Five orders for two units each against three units of stock.
    foreach (range(1, 5) as $ignored) {
        try {
            $confirm(orderFor($product, 2));
        } catch (InsufficientStockException) {
            // expected for all but the first
        }
    }

    $cached = InventoryItem::where('product_id', $product->id)->value('stock_on_hand');
    $ledger = (int) InventoryMovement::where('product_id', $product->id)->sum('quantity_delta');

    expect($cached)->toBe($ledger)
        ->and($cached)->toBe(1)   // 3 - 2, and no second order could take two
        ->and(app(StockLedger::class)->findDrift())->toBeEmpty();
});

it('never lets stock go negative under repeated contention', function (): void {
    $product = Product::factory()->create();
    app(AdjustStock::class)->restock($product, 10);

    $confirm = app(ConfirmOrder::class);

    foreach (range(1, 20) as $ignored) {
        try {
            $confirm(orderFor($product, 3));
        } catch (InsufficientStockException) {
            // expected once stock runs low
        }
    }

    $stock = InventoryItem::where('product_id', $product->id)->value('stock_on_hand');

    expect($stock)->toBeGreaterThanOrEqual(0)
        ->and($stock)->toBe(1)   // 10 - (3 x 3)
        ->and(app(StockLedger::class)->findDrift())->toBeEmpty();
});

it('requires a transaction, so no caller can move stock with an unheld lock', function (): void {
    $product = Product::factory()->create();

    // Asserted here rather than in the Feature suite, because RefreshDatabase
    // wraps those tests in a transaction and the check could never fire.
    expect(DB::transactionLevel())->toBe(0);

    expect(fn () => app(StockLedger::class)->move(
        product: $product,
        delta: 5,
        reason: InventoryMovement::REASON_RESTOCK,
    ))->toThrow(LogicException::class);
});
