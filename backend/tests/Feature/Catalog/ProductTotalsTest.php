<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Product;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;

/*
|--------------------------------------------------------------------------
| What the catalogue is worth
|--------------------------------------------------------------------------
|
| The products screen prints how many rows matched and what the stock on
| them cost. Before it, an owner scanning forty rows of price and cost had
| no way to tell whether that was ten thousand dinars of stock on the
| shelves or a hundred thousand.
|
| AT COST, NEVER AT PRICE. Stock valued at what it would sell for books a
| profit nobody has earned, on goods that may never sell. What the business
| has tied up is what it paid — and that is also why the figure is withheld
| whole from a role that cannot see cost: one number covering the entire
| catalogue discloses more than any single row does.
|
*/

it('values the shelves at what the goods cost, not at what they would sell for', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    // 10 x 4.000 = 40, and 3 x 10.000 = 30. Seventy at cost; the prices are
    // deliberately far higher, so a figure built on them cannot pass.
    Product::factory()->priced(25.0000, 4.0000)->withStock(10)->create();
    Product::factory()->priced(99.0000, 10.0000)->withStock(3)->create();

    $this->getJson('/api/v1/products')
        ->assertOk()
        ->assertJsonPath('totals.products', 2)
        ->assertJsonPath('totals.stock_value', '70.000');
});

it('values the whole filtered set, not the page in front of the reader', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    Product::factory()->count(5)->priced(20.0000, 2.0000)->withStock(10)->create();

    $response = $this->getJson('/api/v1/products?per_page=1')->assertOk();

    $response->assertJsonCount(1, 'data');
    $response->assertJsonPath('totals.products', 5);
    $response->assertJsonPath('totals.stock_value', '100.000');
});

it('counts exactly what the paginator counts', function (): void {
    /*
     * Two queries over one filter, and nothing but this keeps them in step.
     * If they drift, the screen says "40 products" above a table that pages
     * through some other number.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    Product::factory()->count(7)->withStock(1)->create();

    $response = $this->getJson('/api/v1/products?per_page=2')->assertOk();

    expect($response->json('totals.products'))->toBe($response->json('meta.total'));
});

it('follows the filter rather than quietly answering about the whole catalogue', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    Product::factory()->priced(50.0000, 5.0000)->withStock(10)->create(['name' => 'Findable widget']);
    Product::factory()->priced(50.0000, 90.0000)->withStock(10)->create(['name' => 'Other thing']);

    $this->getJson('/api/v1/products?filter[search]=Findable')
        ->assertOk()
        ->assertJsonPath('totals.products', 1)
        ->assertJsonPath('totals.stock_value', '50.000');
});

it('withholds the value from a role that cannot see cost', function (): void {
    Product::factory()->priced(50.0000, 5.0000)->withStock(10)->create();

    $this->actingAs(User::factory()->role(Role::Staff)->create());

    $response = $this->getJson('/api/v1/products')->assertOk();

    // The count is theirs; the value is not. Withheld by ABSENCE, not by a
    // zero — a zero would read as "nothing on the shelves".
    $response->assertJsonPath('totals.products', 1);
    expect($response->json('totals'))->not->toHaveKey('stock_value');
});

it('reports zero rather than null when nothing matched', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    $this->getJson('/api/v1/products?filter[search]=nothing-matches-this')
        ->assertOk()
        ->assertJsonPath('totals.products', 0)
        ->assertJsonPath('totals.stock_value', '0.000');
});

it('never values another business\'s shelves', function (): void {
    /*
     * The value is computed through a join rather than through Eloquent's own
     * fetch, which is where a tenancy scope is easiest to drop.
     */
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner);
    Product::factory()->priced(20.0000, 5.0000)->withStock(4)->create();

    $other = Business::factory()->create(['name' => 'Elsewhere Trading']);

    CurrentBusiness::get()->run($other->id, function (): void {
        BusinessSetting::ensureExists(['company_name' => 'Elsewhere Trading', 'currency' => 'BHD']);
        Product::factory()->priced(900.0000, 500.0000)->withStock(100)->create();
    });

    $this->actingAs($owner)
        ->getJson('/api/v1/products')
        ->assertOk()
        ->assertJsonPath('totals.products', 1)
        ->assertJsonPath('totals.stock_value', '20.000');
});
