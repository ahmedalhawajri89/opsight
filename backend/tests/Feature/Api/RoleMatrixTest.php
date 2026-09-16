<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\ConfirmOrder;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| The authorization matrix, endpoint by endpoint, role by role
|--------------------------------------------------------------------------
|
| Generated from ONE table so that a new endpoint whose row is missing is
| visible, rather than quietly untested (TESTING_STRATEGY.md §3.3).
|
| Transcribed by hand from docs/product/ROLES_AND_PERMISSIONS.md. If the code
| and the document ever diverge, this fails — which is the point.
|
*/

function actingAsRole(Role $role): User
{
    $user = User::factory()->role($role)->create();

    test()->actingAs($user);

    return $user;
}

/** @return array<string, array{string, string, array<string,int>}> */
dataset('endpoints', [
    // [method, path, [role => expected status]]
    'list orders' => ['get', '/api/v1/orders', [
        'owner' => 200, 'manager' => 200, 'analyst' => 200, 'staff' => 200,
    ]],
    'create order' => ['post', '/api/v1/orders', [
        'owner' => 201, 'manager' => 201, 'analyst' => 403, 'staff' => 201,
    ]],
    'list customers' => ['get', '/api/v1/customers', [
        'owner' => 200, 'manager' => 200, 'analyst' => 200, 'staff' => 200,
    ]],
    'list products' => ['get', '/api/v1/products', [
        'owner' => 200, 'manager' => 200, 'analyst' => 200, 'staff' => 200,
    ]],
    'list inventory' => ['get', '/api/v1/inventory', [
        'owner' => 200, 'manager' => 200, 'analyst' => 200, 'staff' => 200,
    ]],
    'low stock' => ['get', '/api/v1/inventory/low-stock', [
        'owner' => 200, 'manager' => 200, 'analyst' => 200, 'staff' => 200,
    ]],
    // The financial boundary: Staff cannot reach expenses at all.
    'list expenses' => ['get', '/api/v1/expenses', [
        'owner' => 200, 'manager' => 200, 'analyst' => 200, 'staff' => 403,
    ]],
    'create expense' => ['post', '/api/v1/expenses', [
        'owner' => 422, 'manager' => 422, 'analyst' => 403, 'staff' => 403,
    ]],
    'create product' => ['post', '/api/v1/products', [
        // 422 means "allowed, but the empty payload failed validation" — the
        // authorization gate passed, which is what this row is testing.
        'owner' => 422, 'manager' => 422, 'analyst' => 403, 'staff' => 403,
    ]],
]);

it('enforces the documented status for every role', function (string $method, string $path, array $expected): void {
    foreach ($expected as $roleValue => $status) {
        $user = User::factory()->role(Role::from($roleValue))->create();

        $response = $this->actingAs($user)->{$method.'Json'}($path, []);

        expect($response->status())->toBe(
            $status,
            "{$roleValue} calling {$method} {$path} returned {$response->status()}, expected {$status}",
        );

        $this->app['auth']->forgetGuards();
    }
})->with('endpoints');

it('rejects every protected endpoint without authentication', function (string $method, string $path): void {
    $this->{$method.'Json'}($path, [])
        ->assertUnauthorized()
        ->assertJsonPath('code', 'auth.unauthenticated');
})->with([
    ['get', '/api/v1/orders'],
    ['post', '/api/v1/orders'],
    ['get', '/api/v1/customers'],
    ['get', '/api/v1/products'],
    ['get', '/api/v1/inventory'],
    ['get', '/api/v1/expenses'],
]);

/*
|--------------------------------------------------------------------------
| Analyst writes nothing
|--------------------------------------------------------------------------
*/

it('refuses every write to an analyst', function (string $method, string $path): void {
    actingAsRole(Role::Analyst);

    $this->{$method.'Json'}($path, [])
        ->assertForbidden()
        ->assertJsonPath('code', 'auth.forbidden');
})->with([
    ['post', '/api/v1/orders'],
    ['post', '/api/v1/customers'],
    ['post', '/api/v1/products'],
    ['post', '/api/v1/expenses'],
]);

it('lets an analyst read everything', function (): void {
    actingAsRole(Role::Analyst);

    foreach (['/api/v1/orders', '/api/v1/customers', '/api/v1/products', '/api/v1/inventory', '/api/v1/expenses'] as $path) {
        $this->getJson($path)->assertOk();
    }
});

/*
|--------------------------------------------------------------------------
| Staff: the narrow role
|--------------------------------------------------------------------------
*/

it('refuses staff any product write, because creation sets a field they cannot read', function (): void {
    actingAsRole(Role::Staff);
    $product = Product::factory()->create();

    $this->postJson('/api/v1/products', [])->assertForbidden();
    $this->patchJson("/api/v1/products/{$product->id}", ['name' => 'x'])->assertForbidden();
});

it('refuses staff any inventory adjustment', function (): void {
    actingAsRole(Role::Staff);
    $product = Product::factory()->withStock(10)->create();

    $this->postJson("/api/v1/inventory/{$product->id}/adjust", [
        'quantity_delta' => 5, 'note' => 'Found some',
    ])->assertForbidden();

    $this->postJson("/api/v1/inventory/{$product->id}/restock", [
        'quantity' => 5,
    ])->assertForbidden();
});

it('lets staff see stock but not change it', function (): void {
    actingAsRole(Role::Staff);
    Product::factory()->withStock(10)->create();

    // Seeing stock is part of the job; changing it without a paper trail is not.
    $this->getJson('/api/v1/inventory')->assertOk();
});

it('refuses staff the entire expense module', function (): void {
    $category = ExpenseCategory::factory()->create();
    $expense = Expense::factory()->create(['expense_category_id' => $category->id]);

    actingAsRole(Role::Staff);

    $this->getJson('/api/v1/expenses')->assertForbidden();
    $this->getJson("/api/v1/expenses/{$expense->id}")->assertForbidden();
    $this->postJson('/api/v1/expenses', [])->assertForbidden();
    $this->patchJson("/api/v1/expenses/{$expense->id}", [])->assertForbidden();
    $this->deleteJson("/api/v1/expenses/{$expense->id}")->assertForbidden();
});

it('lets staff create a customer and an order', function (): void {
    actingAsRole(Role::Staff);

    $this->postJson('/api/v1/customers', ['name' => 'New Buyer'])->assertCreated();
    $this->postJson('/api/v1/orders', [])->assertCreated();
});

/*
|--------------------------------------------------------------------------
| Deletion never removes a record with history
|--------------------------------------------------------------------------
*/

it('refuses to delete a customer who has committed orders', function (): void {
    $customer = Customer::factory()->create();
    $product = Product::factory()->withStock(10)->create();

    $order = Order::factory()->forCustomer($customer)->create();
    $order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $product->price,
        'unit_cost' => $product->cost,
        'quantity' => 1,
        'line_discount' => 0,
        'line_total' => 0,
    ]);
    app(ConfirmOrder::class)($order);

    actingAsRole(Role::Manager);

    // Removing them would rewrite history: their orders still count.
    $this->deleteJson("/api/v1/customers/{$customer->id}")->assertForbidden();
});

it('allows deleting a customer with no order history', function (): void {
    $customer = Customer::factory()->create();

    actingAsRole(Role::Manager);

    $this->deleteJson("/api/v1/customers/{$customer->id}")->assertNoContent();

    // Soft-deleted, so historical references keep resolving.
    expect(Customer::withTrashed()->find($customer->id))->not->toBeNull();
});
