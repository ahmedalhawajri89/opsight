<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\OrderStatus;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| The order lifecycle, over HTTP
|--------------------------------------------------------------------------
|
| The transitions were covered only by calling the domain services directly,
| so the route binding, the policies and the mapping from a domain refusal to
| an HTTP status and code were never exercised — while the API advertises
| exactly these actions to clients in `available_actions`.
|
| Each test goes through the endpoint a client would call.
|
*/

/**
 * A draft, created BY the given user when one is passed.
 *
 * Staff may act only on their own drafts (OrderPolicy::ownsOrCanActOnOthers),
 * so a test that signs in as Staff has to own what it acts on — which is
 * itself part of what these tests are checking.
 */
function apiDraft(int $quantity = 2, int $stock = 10, ?User $creator = null): array
{
    $product = Product::factory()->priced(50.0000, 20.0000)->withStock($stock)->create();
    $order = Order::factory()->create(['created_by' => $creator?->id]);

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

    return [$order, $product];
}

function stockOnHand(Product $product): int
{
    return (int) InventoryItem::where('product_id', $product->id)->value('stock_on_hand');
}

it('confirms a draft, prices it and moves the stock', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();
    [$order, $product] = apiDraft(quantity: 3, creator: $staff);

    $this->actingAs($staff)
        ->postJson("/api/v1/orders/{$order->id}/confirm")
        ->assertOk()
        ->assertJsonPath('data.status', 'confirmed')
        ->assertJsonPath('data.total_amount', '150.000')
        ->assertJsonPath('data.payment_status', 'unpaid');

    expect($order->fresh()->placed_at)->not->toBeNull()
        ->and(stockOnHand($product))->toBe(7);
});

it('refuses to confirm an order with nothing on it', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();
    $order = Order::factory()->create(['created_by' => $staff->id]);

    $this->actingAs($staff)
        ->postJson("/api/v1/orders/{$order->id}/confirm")
        ->assertStatus(409)
        ->assertJsonPath('code', 'order.empty_cannot_confirm');

    expect($order->fresh()->status)->toBe(OrderStatus::Draft);
});

it('refuses to confirm twice, and the second attempt moves no stock', function (): void {
    [$order, $product] = apiDraft(quantity: 2);

    $this->actingAs(User::factory()->role(Role::Manager)->create());
    $this->postJson("/api/v1/orders/{$order->id}/confirm")->assertOk();

    $after = stockOnHand($product);

    $this->postJson("/api/v1/orders/{$order->id}/confirm")
        ->assertStatus(409)
        ->assertJsonPath('code', 'order.illegal_transition');

    expect(stockOnHand($product))->toBe($after);
});

it('refuses to confirm more than is on the shelf, and changes nothing', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();
    [$order, $product] = apiDraft(quantity: 5, stock: 2, creator: $staff);

    $this->actingAs($staff)
        ->postJson("/api/v1/orders/{$order->id}/confirm")
        ->assertStatus(409)
        ->assertJsonPath('code', 'inventory.insufficient_stock');

    // The whole confirm rolls back: the order is still a draft and the stock
    // is untouched, rather than half-decremented.
    expect($order->fresh()->status)->toBe(OrderStatus::Draft)
        ->and(stockOnHand($product))->toBe(2);
});

it('fulfils a confirmed order without touching stock again', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();
    [$order, $product] = apiDraft(creator: $staff);

    $this->actingAs($staff);
    $this->postJson("/api/v1/orders/{$order->id}/confirm")->assertOk();

    $afterConfirm = stockOnHand($product);

    $this->postJson("/api/v1/orders/{$order->id}/fulfil")
        ->assertOk()
        ->assertJsonPath('data.status', 'fulfilled');

    expect(stockOnHand($product))->toBe($afterConfirm);
});

it('cancels with a reason, returns the stock, and keeps the record', function (): void {
    [$order, $product] = apiDraft(quantity: 4);

    $this->actingAs(User::factory()->role(Role::Manager)->create());
    $this->postJson("/api/v1/orders/{$order->id}/confirm")->assertOk();

    $this->postJson("/api/v1/orders/{$order->id}/cancel", ['reason' => 'Customer changed their mind'])
        ->assertOk()
        ->assertJsonPath('data.status', 'cancelled')
        ->assertJsonPath('data.cancellation_reason', 'Customer changed their mind');

    expect(stockOnHand($product))->toBe(10);
});

it('will not cancel without saying why', function (): void {
    [$order] = apiDraft();

    $this->actingAs(User::factory()->role(Role::Manager)->create());
    $this->postJson("/api/v1/orders/{$order->id}/confirm")->assertOk();

    $this->postJson("/api/v1/orders/{$order->id}/cancel", [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reason');

    expect($order->fresh()->status)->toBe(OrderStatus::Confirmed);
});

it('keeps cancelling supervisory', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();
    [$order] = apiDraft(creator: $staff);

    $this->actingAs($staff);
    $this->postJson("/api/v1/orders/{$order->id}/confirm")->assertOk();

    // Staff may confirm and fulfil; reversing recognised revenue is not theirs.
    $this->postJson("/api/v1/orders/{$order->id}/cancel", ['reason' => 'No longer wanted'])
        ->assertForbidden();

    expect($order->fresh()->status)->toBe(OrderStatus::Confirmed);
});

it('deletes a draft but never a committed order', function (): void {
    [$draft] = apiDraft();
    [$committed] = apiDraft();

    $this->actingAs(User::factory()->role(Role::Manager)->create());
    $this->postJson("/api/v1/orders/{$committed->id}/confirm")->assertOk();

    $this->deleteJson("/api/v1/orders/{$draft->id}")->assertNoContent();
    $this->deleteJson("/api/v1/orders/{$committed->id}")->assertForbidden();

    expect(Order::query()->whereKey($draft->id)->exists())->toBeFalse()
        ->and(Order::query()->whereKey($committed->id)->exists())->toBeTrue();
});

it('adds and removes a line on a draft, and refuses both once confirmed', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();
    [$order, $product] = apiDraft(creator: $staff);

    $this->actingAs($staff);

    // 201: adding a line creates a resource.
    $itemId = $this->postJson("/api/v1/orders/{$order->id}/items", [
        'product_id' => $product->id,
        'quantity' => 1,
    ])->assertCreated()->json('data.items.1.id');

    $this->deleteJson("/api/v1/orders/{$order->id}/items/{$itemId}")->assertNoContent();

    $this->postJson("/api/v1/orders/{$order->id}/confirm")->assertOk();

    /*
     * A confirmed order is immutable: its lines carry the snapshot every
     * historical figure is computed from.
     *
     * The refusal is a 403, not a 409, because OrderPolicy::update answers
     * "no" for an order that is not editable — the request never reaches the
     * domain rule that would call it a conflict. Asserted as the system
     * behaves rather than as one might expect it to.
     */
    $this->postJson("/api/v1/orders/{$order->id}/items", ['product_id' => $product->id, 'quantity' => 1])
        ->assertForbidden()
        ->assertJsonPath('code', 'auth.forbidden');

    expect($order->fresh()->items()->count())->toBe(1);
});
