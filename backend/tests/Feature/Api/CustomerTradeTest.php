<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\OrderStatus;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;

/*
|--------------------------------------------------------------------------
| What each customer has actually traded
|--------------------------------------------------------------------------
|
| The customers screen used to promise order history, lifetime value and
| growth in its own description, and show an email address, a company, a
| country and a date added. The list endpoint now computes the three it
| advertised.
|
| They are COMPUTED, never stored (DATABASE_DESIGN.md §3.5), which is what
| makes them impossible to leave stale — and what makes them worth a test,
| because a correlated subquery is easy to get subtly wrong in ways that
| still return a number: counting cancelled orders as value, counting
| another customer's, or counting another business's.
|
*/

function customerWithOrders(array $orders, ?string $name = null): Customer
{
    $customer = Customer::factory()->create($name ? ['name' => $name] : []);

    foreach ($orders as [$status, $total, $placedAt]) {
        Order::factory()->create([
            'customer_id' => $customer->id,
            'status' => $status,
            'subtotal_amount' => $total,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'shipping_amount' => 0,
            'total_amount' => $total,
            'placed_at' => $placedAt,
        ]);
    }

    return $customer;
}

it('counts and values only the orders that were really traded', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    customerWithOrders([
        [OrderStatus::Fulfilled->value, 100.0, '2026-01-10'],
        [OrderStatus::Confirmed->value, 50.0, '2026-02-20'],
        // Neither of these is value received, and counting either would
        // overstate every customer who ever cancelled or left a basket.
        [OrderStatus::Cancelled->value, 999.0, '2026-03-01'],
        [OrderStatus::Draft->value, 888.0, null],
    ]);

    $this->getJson('/api/v1/customers')
        ->assertOk()
        ->assertJsonPath('data.0.orders_count', 2)
        ->assertJsonPath('data.0.lifetime_value', '150.000')
        ->assertJsonPath('data.0.last_order_at', '2026-02-20T00:00:00+00:00');
});

it('never attributes one customer\'s orders to another', function (): void {
    /*
     * The failure a correlated subquery makes when its join condition is
     * wrong: every row gets the same, correct-looking total.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    customerWithOrders([[OrderStatus::Fulfilled->value, 100.0, '2026-01-01']], 'Aaa Customer');
    customerWithOrders([[OrderStatus::Fulfilled->value, 400.0, '2026-01-01']], 'Bbb Customer');

    // Sorted by name, so the order of the two rows is fixed.
    $this->getJson('/api/v1/customers?sort=name')
        ->assertOk()
        ->assertJsonPath('data.0.lifetime_value', '100.000')
        ->assertJsonPath('data.1.lifetime_value', '400.000');
});

it('says a customer has never ordered rather than saying nothing', function (): void {
    /*
     * COUNT over no rows is 0; SUM and MAX are NULL. The count is sent as a
     * real zero because "has never ordered" is a fact the screen should
     * state, while the value and the date stay null rather than claiming a
     * lifetime value of nothing and a last order at the epoch.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    Customer::factory()->create();

    $this->getJson('/api/v1/customers')
        ->assertOk()
        ->assertJsonPath('data.0.orders_count', 0)
        ->assertJsonPath('data.0.lifetime_value', null)
        ->assertJsonPath('data.0.last_order_at', null);
});

it('sorts by what a customer is worth, which is the reason to open the list', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    customerWithOrders([[OrderStatus::Fulfilled->value, 10.0, '2026-01-01']], 'Small');
    customerWithOrders([[OrderStatus::Fulfilled->value, 900.0, '2026-01-01']], 'Large');
    customerWithOrders([[OrderStatus::Fulfilled->value, 300.0, '2026-01-01']], 'Middle');

    $response = $this->getJson('/api/v1/customers?sort=-lifetime_value')->assertOk();

    expect(array_column($response->json('data'), 'name'))->toBe(['Large', 'Middle', 'Small']);
});

it('totals the whole filtered set, not the page', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    foreach (range(1, 4) as $ignored) {
        customerWithOrders([[OrderStatus::Fulfilled->value, 25.0, '2026-01-01']]);
    }

    $response = $this->getJson('/api/v1/customers?per_page=1')->assertOk();

    $response->assertJsonCount(1, 'data');
    $response->assertJsonPath('totals.customers', 4);
    $response->assertJsonPath('totals.lifetime_value', '100.000');
});

it('counts exactly what the paginator counts', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    Customer::factory()->count(5)->create();

    $response = $this->getJson('/api/v1/customers?per_page=2')->assertOk();

    expect($response->json('totals.customers'))->toBe($response->json('meta.total'));
});

it('never counts another business\'s orders towards a customer', function (): void {
    /*
     * The subquery joins on customer_id alone, so nothing in its own
     * condition keeps businesses apart — it relies entirely on the tenancy
     * scope reaching inside a relation aggregate. That is the assumption
     * worth holding down.
     */
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner);
    $mine = customerWithOrders([[OrderStatus::Fulfilled->value, 100.0, '2026-01-01']]);

    $other = Business::factory()->create(['name' => 'Elsewhere Trading']);

    CurrentBusiness::get()->run($other->id, function () use ($mine): void {
        BusinessSetting::ensureExists(['company_name' => 'Elsewhere Trading', 'currency' => 'BHD']);

        // An order in ANOTHER business pointing at my customer's id.
        Order::factory()->create([
            'customer_id' => $mine->id,
            'status' => OrderStatus::Fulfilled->value,
            'subtotal_amount' => 5000,
            'discount_amount' => 0,
            'tax_amount' => 0,
            'shipping_amount' => 0,
            'total_amount' => 5000,
            'placed_at' => '2026-05-05',
        ]);
    });

    $this->actingAs($owner)
        ->getJson('/api/v1/customers')
        ->assertOk()
        ->assertJsonPath('data.0.orders_count', 1)
        ->assertJsonPath('data.0.lifetime_value', '100.000')
        ->assertJsonPath('totals.lifetime_value', '100.000');
});

it('withholds lifetime value from a role without customers.view_ltv, in the rows, the total and the sort', function (): void {
    // Staff see customers, and the orders they placed, but not what each is worth.
    $this->actingAs(User::factory()->role(Role::Staff)->create());

    customerWithOrders([[OrderStatus::Fulfilled->value, 100.0, '2026-01-10']]);

    $response = $this->getJson('/api/v1/customers')->assertOk();

    expect($response->json('data.0'))->not->toHaveKey('lifetime_value')
        ->and($response->json('data.0.orders_count'))->toBe(1)
        ->and($response->json('totals'))->not->toHaveKey('lifetime_value');

    // Ranking by the figure would disclose it.
    $this->getJson('/api/v1/customers?sort=-lifetime_value')->assertStatus(422);
});
