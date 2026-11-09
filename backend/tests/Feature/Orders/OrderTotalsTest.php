<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\OrderStatus;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Order;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;

/*
|--------------------------------------------------------------------------
| What the orders list adds up to
|--------------------------------------------------------------------------
|
| The list screen prints a band above the table saying how many orders
| matched and what they come to. Three things have to be true of it, and all
| three are the kind that fail silently:
|
|   1. It totals THE WHOLE FILTERED SET, not the page. A band that silently
|      totalled twenty-five rows out of two thousand would look entirely
|      correct and be wrong by two orders of magnitude.
|
|   2. It moves WITH the filters. A total that ignores the status filter
|      answers a different question from the one the reader asked.
|
|   3. Margin is withheld from a role that cannot see margin — as a set, the
|      same way the column is. A total is a disclosure like any other: the
|      gross profit of every order at once is MORE revealing than one row,
|      not less.
|
*/

/** An order with known figures, so the sums can be asserted exactly. */
function totalledOrder(string $status, float $subtotal, float $discount, float $cogs): Order
{
    return Order::factory()->create([
        'status' => $status,
        'subtotal_amount' => $subtotal,
        'discount_amount' => $discount,
        'cogs_amount' => $cogs,
        'tax_amount' => 0,
        'shipping_amount' => 0,
        'total_amount' => $subtotal - $discount,
        'placed_at' => now(),
    ]);
}

it('totals every order that matched, not the page in front of the reader', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    foreach (range(1, 5) as $ignored) {
        totalledOrder(OrderStatus::Fulfilled->value, 100.0, 10.0, 40.0);
    }

    // One row per page: if the band totalled what it could see it would
    // report a single order's figures.
    $response = $this->getJson('/api/v1/orders?per_page=1')->assertOk();

    $response->assertJsonCount(1, 'data');
    $response->assertJsonPath('totals.orders', 5);
    $response->assertJsonPath('totals.sales', '450.000');
    $response->assertJsonPath('totals.gross_profit', '250.000');
});

it('counts exactly what the paginator counts', function (): void {
    /*
     * The band's count and the paginator's are two queries over one filter,
     * and nothing but a test keeps them in step. If they ever disagree, the
     * screen says "2,379 orders" above a table that pages through 2,105.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    foreach (range(1, 7) as $ignored) {
        totalledOrder(OrderStatus::Fulfilled->value, 20.0, 0.0, 5.0);
    }

    $response = $this->getJson('/api/v1/orders?per_page=2')->assertOk();

    expect($response->json('totals.orders'))->toBe($response->json('meta.total'));
});

it('follows the status filter rather than quietly answering about everything', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    totalledOrder(OrderStatus::Fulfilled->value, 200.0, 0.0, 80.0);
    totalledOrder(OrderStatus::Cancelled->value, 999.0, 0.0, 500.0);

    $this->getJson('/api/v1/orders?filter[status]=fulfilled')
        ->assertOk()
        ->assertJsonPath('totals.orders', 1)
        ->assertJsonPath('totals.sales', '200.000')
        ->assertJsonPath('totals.gross_profit', '120.000');

    // The reader asked for cancelled orders, so the band is about cancelled
    // orders. A hidden restriction to "real" sales would make the figure
    // disagree with the column printed directly beneath it.
    $this->getJson('/api/v1/orders?filter[status]=cancelled')
        ->assertOk()
        ->assertJsonPath('totals.orders', 1)
        ->assertJsonPath('totals.sales', '999.000');
});

it('withholds the margin total from a role that cannot see margin', function (): void {
    totalledOrder(OrderStatus::Fulfilled->value, 100.0, 0.0, 60.0);

    $this->actingAs(User::factory()->role(Role::Staff)->create());

    $response = $this->getJson('/api/v1/orders')->assertOk();

    // The count and the sales figure are theirs; the profit is not. Withheld
    // by ABSENCE, not by a zero — a zero would read as "no profit".
    $response->assertJsonPath('totals.orders', 1);
    $response->assertJsonPath('totals.sales', '100.000');
    expect($response->json('totals'))->not->toHaveKey('gross_profit');
});

it('reports zero rather than null when nothing matched', function (): void {
    /*
     * An empty filter result must still produce a figure. `SUM` over no rows
     * is NULL in SQL, and a null reaching the screen renders as an empty
     * space where a reader expects a number.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    $this->getJson('/api/v1/orders?filter[search]=nothing-matches-this')
        ->assertOk()
        ->assertJsonPath('totals.orders', 0)
        ->assertJsonPath('totals.sales', '0.000')
        ->assertJsonPath('totals.gross_profit', '0.000');
});

it('never totals another business\'s orders', function (): void {
    /*
     * The aggregate runs on the query builder rather than through Eloquent's
     * own fetch, which is exactly where a tenancy scope is easiest to drop.
     * Dropping it here would leak one number that sums every business on the
     * installation.
     */
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner);
    totalledOrder(OrderStatus::Fulfilled->value, 100.0, 0.0, 40.0);

    // A second business, entered properly. `User::factory()` on its own makes
    // another owner INSIDE the current business — which is why this test
    // first reported two orders where it expected one.
    $other = Business::factory()->create(['name' => 'Elsewhere Trading']);

    CurrentBusiness::get()->run($other->id, function (): void {
        BusinessSetting::ensureExists(['company_name' => 'Elsewhere Trading', 'currency' => 'BHD']);
        totalledOrder(OrderStatus::Fulfilled->value, 777.0, 0.0, 300.0);
    });

    $this->actingAs($owner)
        ->getJson('/api/v1/orders')
        ->assertOk()
        ->assertJsonPath('totals.orders', 1)
        ->assertJsonPath('totals.sales', '100.000');
});
