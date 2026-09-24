<?php

declare(strict_types=1);

use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\OrderStatus;
use App\Domain\Orders\OrderTransitionException;
use App\Models\Order;
use App\Models\Product;

/*
|--------------------------------------------------------------------------
| A discount cannot exceed what is being discounted
|--------------------------------------------------------------------------
|
| Found by a data sweep of the development database: two orders carried a
| NEGATIVE total, because `discount_amount` was only ever checked against zero
| and never against the subtotal. A negative total is not a small display
| problem — it subtracts from revenue, makes "outstanding" meaningless, and
| gives a refund a limit below zero.
|
*/

function draftWorth(string $price, int $quantity, float $discount): Order
{
    $product = Product::factory()->priced((float) $price, 1.0)->withStock(50)->create();
    $order = Order::factory()->create(['discount_amount' => $discount]);

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

it('refuses to confirm an order discounted below nothing', function (): void {
    // Ten dinars of goods, fifty dinars off.
    $order = draftWorth('10', 1, 50);

    expect(fn () => app(ConfirmOrder::class)($order))->toThrow(OrderTransitionException::class);

    $order->refresh();

    expect($order->status)->toBe(OrderStatus::Draft)
        ->and($order->total_amount)->toBe('0.000');
});

it('allows a discount of exactly the subtotal', function (): void {
    // Giving the goods away is a decision a business may make; owing the
    // customer money for taking them is not.
    $order = app(ConfirmOrder::class)(draftWorth('10', 2, 20.0));

    expect($order->status)->toBe(OrderStatus::Confirmed)
        ->and($order->total_amount)->toBe('0.000')
        ->and($order->discount_amount)->toBe('20.000');
});

it('leaves an ordinary discount alone', function (): void {
    $order = app(ConfirmOrder::class)(draftWorth('10', 3, 5.0));

    expect($order->total_amount)->toBe('25.000')
        ->and($order->subtotal_amount)->toBe('30.000');
});
