<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Inventory\AdjustStock;
use App\Domain\Orders\ConfirmOrder;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Field-level redaction
|--------------------------------------------------------------------------
|
| The project's hardest authorization requirement, and the one most easily got
| wrong: a restricted field must be ABSENT from the response body, not present
| and null.
|
| A null still tells the reader the field exists, and it invites a client-side
| "fix" that reveals it. Every assertion here uses assertJsonMissingPath rather
| than assertNull, deliberately (SECURITY.md §2.3).
|
*/

function seededOrderWithCost(): Order
{
    $product = Product::factory()->priced(250.0000, 90.0000)->withStock(20)->create();
    $order = Order::factory()->create();

    $order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $product->price,
        'unit_cost' => $product->cost,
        'quantity' => 2,
        'line_discount' => 0,
        'line_total' => 0,
    ]);

    return app(ConfirmOrder::class)($order);
}

/*
|--------------------------------------------------------------------------
| Products
|--------------------------------------------------------------------------
*/

it('omits product cost entirely for staff', function (): void {
    Product::factory()->create();
    $this->actingAs(User::factory()->staff()->create());

    $response = $this->getJson('/api/v1/products')->assertOk();

    // Absent, not null.
    $response->assertJsonMissingPath('data.0.cost');
    expect(array_key_exists('cost', $response->json('data.0')))->toBeFalse();
});

it('includes product cost for every role that may read it', function (Role $role): void {
    Product::factory()->priced(100.0000, 40.0000)->create();
    $this->actingAs(User::factory()->role($role)->create());

    $this->getJson('/api/v1/products')
        ->assertOk()
        ->assertJsonPath('data.0.cost', '40.0000');
})->with([Role::Owner, Role::Manager, Role::Analyst]);

it('omits product cost on the detail endpoint too, not just the list', function (): void {
    $product = Product::factory()->create();
    $this->actingAs(User::factory()->staff()->create());

    // One resource class per model means the detail route inherits the
    // redaction — it cannot forget.
    $this->getJson("/api/v1/products/{$product->id}")
        ->assertOk()
        ->assertJsonMissingPath('data.cost');
});

/*
|--------------------------------------------------------------------------
| Orders
|--------------------------------------------------------------------------
*/

it('omits cogs and gross profit from an order for staff', function (): void {
    $order = seededOrderWithCost();
    $this->actingAs(User::factory()->staff()->create());

    $response = $this->getJson("/api/v1/orders/{$order->id}")->assertOk();

    $response->assertJsonMissingPath('data.cogs_amount')
        ->assertJsonMissingPath('data.gross_profit');

    $payload = $response->json('data');

    expect(array_key_exists('cogs_amount', $payload))->toBeFalse()
        ->and(array_key_exists('gross_profit', $payload))->toBeFalse();
});

it('includes cogs and gross profit for a manager', function (): void {
    $order = seededOrderWithCost();
    $this->actingAs(User::factory()->manager()->create());

    $this->getJson("/api/v1/orders/{$order->id}")
        ->assertOk()
        ->assertJsonPath('data.cogs_amount', '180.000')     // 90.00 x 2
        ->assertJsonPath('data.gross_profit', '320.000');   // 500.00 - 180.00
});

it('omits the unit cost snapshot from order lines for staff', function (): void {
    $order = seededOrderWithCost();
    $this->actingAs(User::factory()->staff()->create());

    $response = $this->getJson("/api/v1/orders/{$order->id}")->assertOk();

    $response->assertJsonMissingPath('data.items.0.unit_cost');

    // The selling price IS visible — Staff need it to do their job.
    expect($response->json('data.items.0.unit_price'))->toBe('250.0000');
});

it('still shows staff the revenue side of an order', function (): void {
    $order = seededOrderWithCost();
    $this->actingAs(User::factory()->staff()->create());

    // Withholding cost must not withhold what the job requires.
    $this->getJson("/api/v1/orders/{$order->id}")
        ->assertOk()
        ->assertJsonPath('data.subtotal_amount', '500.000')
        ->assertJsonPath('data.total_amount', '500.000');
});

/*
|--------------------------------------------------------------------------
| Inventory
|--------------------------------------------------------------------------
*/

it('omits the restock unit cost from a movement for staff', function (): void {
    $product = Product::factory()->create();
    app(AdjustStock::class)->restock($product, 50, '17.5000');

    $this->actingAs(User::factory()->staff()->create());

    $this->getJson("/api/v1/inventory/{$product->id}/movements")
        ->assertOk()
        ->assertJsonMissingPath('data.0.unit_cost');
});

it('includes the restock unit cost for a manager', function (): void {
    $product = Product::factory()->create();
    app(AdjustStock::class)->restock($product, 50, '17.5000');

    $this->actingAs(User::factory()->manager()->create());

    $this->getJson("/api/v1/inventory/{$product->id}/movements")
        ->assertOk()
        ->assertJsonPath('data.0.unit_cost', '17.5000');
});

/*
|--------------------------------------------------------------------------
| Available actions are resolved server-side
|--------------------------------------------------------------------------
*/

it('tells each role only the order actions it may actually take', function (): void {
    $order = seededOrderWithCost();   // confirmed

    $this->actingAs(User::factory()->staff()->create());
    $staffActions = $this->getJson("/api/v1/orders/{$order->id}")->json('data.available_actions');

    $this->app['auth']->forgetGuards();

    $this->actingAs(User::factory()->manager()->create());
    $managerActions = $this->getJson("/api/v1/orders/{$order->id}")->json('data.available_actions');

    // Staff may progress an order but not reverse it.
    expect($staffActions)->toContain('fulfil')
        ->and($staffActions)->not->toContain('cancel')
        ->and($managerActions)->toContain('fulfil')
        ->and($managerActions)->toContain('cancel');
});

it('offers no action that is illegal for the current status', function (): void {
    $product = Product::factory()->withStock(5)->create();
    $draft = Order::factory()->create();
    $draft->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $product->price,
        'unit_cost' => $product->cost,
        'quantity' => 1,
        'line_discount' => 0,
        'line_total' => 0,
    ]);

    $this->actingAs(User::factory()->manager()->create());

    $actions = $this->getJson("/api/v1/orders/{$draft->id}")->json('data.available_actions');

    // A draft cannot be fulfilled or refunded, whatever the caller may do.
    expect($actions)->toContain('confirm')
        ->and($actions)->toContain('cancel')
        ->and($actions)->not->toContain('fulfil')
        ->and($actions)->not->toContain('refund');
});
