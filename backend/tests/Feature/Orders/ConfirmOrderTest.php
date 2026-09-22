<?php

declare(strict_types=1);

use App\Domain\Inventory\InsufficientStockException;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\OrderStatus;
use App\Domain\Orders\OrderTransitionException;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Support\Money;

function addItem(Order $order, Product $product, int $quantity = 1): OrderItem
{
    return $order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $product->price,
        'unit_cost' => $product->cost,
        'quantity' => $quantity,
        'line_discount' => 0,
        'line_total' => 0,
    ]);
}

/*
|--------------------------------------------------------------------------
| The snapshot — the most important rule in the system
|--------------------------------------------------------------------------
*/

it('snapshots name, sku, price and cost onto every line at confirm', function (): void {
    $product = Product::factory()->priced(25.0000, 10.0000)->withStock(50)->create([
        'name' => 'Laptop X',
        'sku' => 'LAP-X-001',
    ]);
    $order = Order::factory()->create();
    addItem($order, $product, 2);

    app(ConfirmOrder::class)($order);

    $line = $order->items()->first();

    expect($line->product_name)->toBe('Laptop X')
        ->and($line->product_sku)->toBe('LAP-X-001')
        ->and((float) $line->unit_price)->toBe(25.0)
        ->and((float) $line->unit_cost)->toBe(10.0);
});

it('does not let a later price or cost change rewrite a confirmed order', function (): void {
    // This is the Laptop X scenario: sold at 800, catalog later says 900.
    $product = Product::factory()->priced(800.0000, 500.0000)->withStock(10)->create();
    $order = Order::factory()->create();
    addItem($order, $product, 1);

    app(ConfirmOrder::class)($order);

    $before = [
        'unit_price' => (string) $order->items()->first()->unit_price,
        'unit_cost' => (string) $order->items()->first()->unit_cost,
        'subtotal' => (string) $order->fresh()->subtotal_amount,
        'cogs' => (string) $order->fresh()->cogs_amount,
    ];

    // The catalog moves on.
    $product->update(['price' => 900.0000, 'cost' => 600.0000]);

    $after = [
        'unit_price' => (string) $order->items()->first()->fresh()->unit_price,
        'unit_cost' => (string) $order->items()->first()->fresh()->unit_cost,
        'subtotal' => (string) $order->fresh()->subtotal_amount,
        'cogs' => (string) $order->fresh()->cogs_amount,
    ];

    expect($after)->toBe($before);
});

/*
|--------------------------------------------------------------------------
| Totals
|--------------------------------------------------------------------------
*/

it('computes totals server-side and freezes them', function (): void {
    $a = Product::factory()->priced(10.5000, 4.0000)->withStock(20)->create();
    $b = Product::factory()->priced(3.2500, 1.5000)->withStock(20)->create();

    $order = Order::factory()->withCharges(discount: 5, tax: 2, shipping: 3)->create();
    addItem($order, $a, 3);   // 31.50
    addItem($order, $b, 4);   // 13.00

    app(ConfirmOrder::class)($order);
    $order->refresh();

    expect((float) $order->subtotal_amount)->toBe(44.50)
        ->and((float) $order->cogs_amount)->toBe(18.00)   // 12.00 + 6.00
        ->and((float) $order->total_amount)->toBe(44.50 - 5 + 2 + 3);
});

it('keeps stored totals equal to the sum of their lines', function (): void {
    $products = Product::factory()->count(4)->withStock(100)->create();
    $order = Order::factory()->create();

    foreach ($products as $index => $product) {
        addItem($order, $product, $index + 1);
    }

    app(ConfirmOrder::class)($order);
    $order->refresh();

    $lineSum = $order->items->sum(fn ($item): float => (float) $item->line_total);
    $scale = Money::scale();
    $cogsSum = $order->items->sum(
        fn ($item): float => round((float) $item->unit_cost * $item->quantity, $scale),
    );

    expect((float) $order->subtotal_amount)->toBe(round($lineSum, $scale))
        ->and((float) $order->cogs_amount)->toBe(round($cogsSum, $scale));
});

/*
|--------------------------------------------------------------------------
| Stock
|--------------------------------------------------------------------------
*/

it('decrements stock by exactly the ordered quantity', function (): void {
    $product = Product::factory()->withStock(50)->create();
    $order = Order::factory()->create();
    addItem($order, $product, 12);

    app(ConfirmOrder::class)($order);

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(38);
});

it('writes a sale movement referencing the order', function (): void {
    $product = Product::factory()->withStock(10)->create();
    $order = Order::factory()->create();
    addItem($order, $product, 3);

    app(ConfirmOrder::class)($order);

    $movement = InventoryMovement::where('reason', InventoryMovement::REASON_SALE)->first();

    expect($movement->quantity_delta)->toBe(-3)
        ->and($movement->balance_after)->toBe(7)
        ->and($movement->reference_type)->toBe('order')
        ->and($movement->reference_id)->toBe($order->id);
});

it('refuses to confirm beyond available stock', function (): void {
    $product = Product::factory()->withStock(5)->create();
    $order = Order::factory()->create();
    addItem($order, $product, 6);

    expect(fn () => app(ConfirmOrder::class)($order))
        ->toThrow(InsufficientStockException::class);
});

it('persists NO partial stock decrement when a later line fails', function (): void {
    // The rollback test. Line one succeeds, line two exceeds stock — and the
    // whole confirm must vanish, including line one's decrement.
    $plenty = Product::factory()->withStock(100)->create();
    $scarce = Product::factory()->withStock(1)->create();

    $order = Order::factory()->create();
    addItem($order, $plenty, 5);
    addItem($order, $scarce, 10);

    try {
        app(ConfirmOrder::class)($order);
    } catch (InsufficientStockException) {
        // expected
    }

    expect(InventoryItem::where('product_id', $plenty->id)->value('stock_on_hand'))->toBe(100)
        ->and(InventoryItem::where('product_id', $scarce->id)->value('stock_on_hand'))->toBe(1)
        ->and($order->fresh()->status)->toBe(OrderStatus::Draft)
        ->and($order->fresh()->placed_at)->toBeNull()
        ->and(InventoryMovement::where('reason', InventoryMovement::REASON_SALE)->count())->toBe(0);
});

/*
|--------------------------------------------------------------------------
| Preconditions
|--------------------------------------------------------------------------
*/

it('refuses to confirm an order with no items', function (): void {
    $order = Order::factory()->create();

    expect(fn () => app(ConfirmOrder::class)($order))
        ->toThrow(OrderTransitionException::class);
});

it('refuses to confirm an order that is already confirmed', function (): void {
    $product = Product::factory()->withStock(10)->create();
    $order = Order::factory()->create();
    addItem($order, $product, 1);

    app(ConfirmOrder::class)($order);

    expect(fn () => app(ConfirmOrder::class)($order->fresh()))
        ->toThrow(OrderTransitionException::class);
});

it('sets placed_at, which is the business date every metric ranges on', function (): void {
    $product = Product::factory()->withStock(10)->create();
    $order = Order::factory()->create();
    addItem($order, $product, 1);

    expect($order->placed_at)->toBeNull();

    app(ConfirmOrder::class)($order);

    expect($order->fresh()->placed_at)->not->toBeNull();
});
