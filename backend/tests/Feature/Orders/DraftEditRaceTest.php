<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\OrderStatus;
use App\Domain\Orders\OrderTransitionException;
use App\Http\Controllers\Api\V1\OrderController;
use App\Models\Order;
use App\Models\OrderItem;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\Request;

/*
|--------------------------------------------------------------------------
| An edit and a confirm at the same moment (security audit, 2026-11-13)
|--------------------------------------------------------------------------
|
| The edit's "draft only" check used to run on the order route binding had
| loaded. Here that copy is stale — it still says draft — while the row has
| already been confirmed, which is exactly the state a concurrent confirm
| leaves behind. Each edit must look again under the lock and refuse.
|
*/

beforeEach(function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    $this->order = Order::factory()->create(['discount_amount' => 0]);
    $product = Product::factory()->create();
    $this->item = $this->order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $product->price,
        'unit_cost' => $product->cost,
        'quantity' => 1,
        'line_discount' => 0,
        'line_total' => 0,
    ]);

    // The copy route binding loaded, before the confirm committed.
    $this->stale = Order::query()->findOrFail($this->order->id);

    Order::query()->whereKey($this->order->id)->update(['status' => OrderStatus::Confirmed->value]);

    $this->controller = app(OrderController::class);
});

it('refuses to change the charges on an order confirmed meanwhile', function (): void {
    $request = Request::create('/', 'PATCH', ['discount_amount' => 50]);

    expect(fn () => $this->controller->update($request, $this->stale))
        ->toThrow(OrderTransitionException::class);

    expect((string) $this->order->fresh()->discount_amount)->toBe((string) $this->order->discount_amount);
});

it('refuses to delete an order confirmed meanwhile', function (): void {
    expect(fn () => $this->controller->destroy(Request::create('/', 'DELETE'), $this->stale))
        ->toThrow(OrderTransitionException::class);

    expect(Order::query()->whereKey($this->order->id)->exists())->toBeTrue();
});

it('refuses to remove a line from an order confirmed meanwhile', function (): void {
    expect(fn () => $this->controller->removeItem(Request::create('/', 'DELETE'), $this->stale, $this->item))
        ->toThrow(OrderTransitionException::class);

    expect(OrderItem::query()->whereKey($this->item->id)->exists())->toBeTrue();
});
