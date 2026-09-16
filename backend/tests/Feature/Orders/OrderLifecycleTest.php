<?php

declare(strict_types=1);

use App\Domain\Orders\CancelOrder;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\FulfilOrder;
use App\Domain\Orders\OrderStatus;
use App\Domain\Orders\OrderTransitionException;
use App\Domain\Orders\RecordRefund;
use App\Models\InventoryItem;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;

function draftWith(Product $product, int $quantity = 1): Order
{
    $order = Order::factory()->create();

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

    return $order;
}

function confirmed(Product $product, int $quantity = 1): Order
{
    return app(ConfirmOrder::class)(draftWith($product, $quantity));
}

/*
|--------------------------------------------------------------------------
| The state machine
|--------------------------------------------------------------------------
|
| Every legal transition succeeds; every illegal one is refused and changes
| nothing (MVP_SCOPE.md §6.3).
|
*/

it('permits exactly the documented transitions', function (OrderStatus $from, array $expected): void {
    expect($from->allowedTransitions())->toEqualCanonicalizing($expected);
})->with([
    'draft' => [OrderStatus::Draft, [OrderStatus::Confirmed, OrderStatus::Cancelled]],
    'confirmed' => [OrderStatus::Confirmed, [OrderStatus::Fulfilled, OrderStatus::Cancelled]],
    'fulfilled' => [OrderStatus::Fulfilled, [OrderStatus::Cancelled, OrderStatus::Refunded]],
    'cancelled' => [OrderStatus::Cancelled, []],
    'refunded' => [OrderStatus::Refunded, []],
]);

it('treats cancelled and refunded as terminal', function (): void {
    expect(OrderStatus::Cancelled->allowedTransitions())->toBeEmpty()
        ->and(OrderStatus::Refunded->allowedTransitions())->toBeEmpty();
});

/*
|--------------------------------------------------------------------------
| Fulfil
|--------------------------------------------------------------------------
*/

it('fulfils a confirmed order without touching stock again', function (): void {
    $product = Product::factory()->withStock(20)->create();
    $order = confirmed($product, 5);

    $stockAfterConfirm = InventoryItem::where('product_id', $product->id)->value('stock_on_hand');

    app(FulfilOrder::class)($order);

    // The decrement happened at confirm. Fulfilment records delivery, not a
    // second sale — decrementing again here is the obvious mistake.
    expect($order->fresh()->status)->toBe(OrderStatus::Fulfilled)
        ->and($order->fresh()->fulfilled_at)->not->toBeNull()
        ->and(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))
        ->toBe($stockAfterConfirm);
});

it('refuses to fulfil a draft', function (): void {
    $product = Product::factory()->withStock(10)->create();

    expect(fn () => app(FulfilOrder::class)(draftWith($product)))
        ->toThrow(OrderTransitionException::class);
});

/*
|--------------------------------------------------------------------------
| Cancel
|--------------------------------------------------------------------------
*/

it('returns exactly the ordered stock when a confirmed order is cancelled', function (): void {
    $product = Product::factory()->withStock(30)->create();
    $order = confirmed($product, 12);

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(18);

    app(CancelOrder::class)($order, 'Customer changed their mind');

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(30);
});

it('returns stock by a compensating entry, leaving both facts on record', function (): void {
    $product = Product::factory()->withStock(10)->create();
    $order = confirmed($product, 4);

    app(CancelOrder::class)($order, 'Out of area');

    $movements = InventoryMovement::where('reference_id', $order->id)
        ->orderBy('id')
        ->pluck('quantity_delta')
        ->all();

    // The sale and its reversal both survive — the original is never edited.
    expect($movements)->toBe([-4, 4]);
});

it('does not move stock when cancelling a draft, which never held any', function (): void {
    $product = Product::factory()->withStock(10)->create();
    $order = draftWith($product, 3);

    app(CancelOrder::class)($order, 'Entered by mistake');

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(10)
        ->and(InventoryMovement::where('reference_id', $order->id)->count())->toBe(0);
});

it('requires a cancellation reason', function (string $reason): void {
    $product = Product::factory()->withStock(10)->create();
    $order = confirmed($product, 1);

    expect(fn () => app(CancelOrder::class)($order, $reason))
        ->toThrow(OrderTransitionException::class);
})->with(['empty' => '', 'whitespace only' => '   ']);

it('keeps the cancelled order on record rather than deleting it', function (): void {
    $product = Product::factory()->withStock(10)->create();
    $order = confirmed($product, 2);

    app(CancelOrder::class)($order, 'Duplicate');

    // The Cancellation Rate metric needs this row to exist (METRICS.md §2.11).
    expect(Order::find($order->id))->not->toBeNull()
        ->and($order->fresh()->status)->toBe(OrderStatus::Cancelled)
        ->and($order->fresh()->cancellation_reason)->toBe('Duplicate');
});

/*
|--------------------------------------------------------------------------
| Refund
|--------------------------------------------------------------------------
*/

it('records a refund against a fulfilled order', function (): void {
    $product = Product::factory()->priced(50.0000, 20.0000)->withStock(10)->create();
    $order = app(FulfilOrder::class)(confirmed($product, 2));

    app(RecordRefund::class)($order, '100.00');

    expect($order->fresh()->status)->toBe(OrderStatus::Refunded)
        ->and((float) $order->fresh()->refunded_amount)->toBe(100.0)
        ->and($order->fresh()->refunded_at)->not->toBeNull();
});

it('refuses a refund larger than the order total', function (): void {
    $product = Product::factory()->priced(50.0000, 20.0000)->withStock(10)->create();
    $order = app(FulfilOrder::class)(confirmed($product, 1));

    expect(fn () => app(RecordRefund::class)($order, '999.00'))
        ->toThrow(OrderTransitionException::class);
});

it('refuses to refund an order that was never fulfilled', function (): void {
    $product = Product::factory()->withStock(10)->create();

    expect(fn () => app(RecordRefund::class)(confirmed($product, 1), '10.00'))
        ->toThrow(OrderTransitionException::class);
});

it('returns stock on refund only when asked', function (): void {
    $product = Product::factory()->priced(50.0000, 20.0000)->withStock(10)->create();

    $returned = app(FulfilOrder::class)(confirmed($product, 3));
    app(RecordRefund::class)($returned, '50.00', returnStock: true);

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(10);

    // Damaged goods do not go back on the shelf; silently restocking them
    // would overstate what is sellable.
    $kept = app(FulfilOrder::class)(confirmed($product, 3));
    app(RecordRefund::class)($kept, '50.00', returnStock: false);

    expect(InventoryItem::where('product_id', $product->id)->value('stock_on_hand'))->toBe(7);
});

/*
|--------------------------------------------------------------------------
| Immutability
|--------------------------------------------------------------------------
*/

it('reports a finalized order as not editable', function (OrderStatus $status): void {
    expect($status->isEditable())->toBeFalse();
})->with([
    OrderStatus::Confirmed,
    OrderStatus::Fulfilled,
    OrderStatus::Cancelled,
    OrderStatus::Refunded,
]);

it('reports a draft as editable', function (): void {
    expect(OrderStatus::Draft->isEditable())->toBeTrue();
});
