<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\InventoryItem;
use App\Models\Product;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;

/*
|--------------------------------------------------------------------------
| The two questions the stock screen is opened to answer
|--------------------------------------------------------------------------
|
| How many lines need reordering, and what are the goods on the shelves
| worth. Before this band the reader counted the amber rows by eye — on the
| first page of them, which on a real catalogue is not all of them.
|
| The count runs the SAME StockLevel::whereLow the rows and the filter use.
| Written out a second time it would be a second definition of "low", and
| the first time the default threshold changed, the badge on a row and the
| count above it would quietly stop agreeing.
|
*/

function stocked(int $onHand, ?int $reorderPoint, float $cost = 1.0): InventoryItem
{
    $product = Product::factory()->priced(10.0000, $cost)->withStock($onHand)->create();

    $item = InventoryItem::where('product_id', $product->id)->firstOrFail();
    $item->update(['stock_on_hand' => $onHand, 'reorder_point' => $reorderPoint]);

    return $item->refresh();
}

it('counts a line as low on the same rule the row and the filter use', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    stocked(onHand: 2, reorderPoint: 5);   // under its point
    stocked(onHand: 5, reorderPoint: 5);   // AT its point counts as low
    stocked(onHand: 9, reorderPoint: 5);   // above it

    $response = $this->getJson('/api/v1/inventory')->assertOk();

    $response->assertJsonPath('totals.items', 3);
    $response->assertJsonPath('totals.low', 2);
});

it('agrees with the low-stock filter it sits above', function (): void {
    /*
     * The band and the filtered list are two queries over one definition. If
     * they drift, the screen says "5 need reordering" over a filter that
     * produces some other number of rows, and neither can be trusted again.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    stocked(onHand: 1, reorderPoint: 4);
    stocked(onHand: 2, reorderPoint: 4);
    stocked(onHand: 40, reorderPoint: 4);

    $all = $this->getJson('/api/v1/inventory')->assertOk();
    $low = $this->getJson('/api/v1/inventory?filter[low_stock]=true')->assertOk();

    expect($all->json('totals.low'))->toBe($low->json('meta.total'));
});

it('values the shelves at what the goods cost', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    stocked(onHand: 10, reorderPoint: 2, cost: 4.0);  // 40
    stocked(onHand: 3, reorderPoint: 2, cost: 10.0);  // 30

    // The selling price on both is 10.000, so a figure built on price would
    // come to 130 and cannot pass by accident.
    $this->getJson('/api/v1/inventory')
        ->assertOk()
        ->assertJsonPath('totals.value', '70.000');
});

it('totals the whole filtered set, not the page', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    foreach (range(1, 6) as $ignored) {
        stocked(onHand: 5, reorderPoint: 1, cost: 2.0);
    }

    $response = $this->getJson('/api/v1/inventory?per_page=2')->assertOk();

    $response->assertJsonCount(2, 'data');
    $response->assertJsonPath('totals.items', 6);
    $response->assertJsonPath('totals.value', '60.000');
    expect($response->json('totals.items'))->toBe($response->json('meta.total'));
});

it('withholds the value from a role that cannot see cost, but not the count', function (): void {
    stocked(onHand: 1, reorderPoint: 5, cost: 100.0);

    $this->actingAs(User::factory()->role(Role::Staff)->create());

    $response = $this->getJson('/api/v1/inventory')->assertOk();

    // Staff reorder stock; they are meant to know what is running out. What
    // the goods cost is a different disclosure, and it is withheld by
    // ABSENCE rather than by a zero.
    $response->assertJsonPath('totals.items', 1);
    $response->assertJsonPath('totals.low', 1);
    expect($response->json('totals'))->not->toHaveKey('value');
});

it('reports zero rather than null when nothing matched', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    $this->getJson('/api/v1/inventory?filter[search]=nothing-matches-this')
        ->assertOk()
        ->assertJsonPath('totals.items', 0)
        ->assertJsonPath('totals.low', 0)
        ->assertJsonPath('totals.value', '0.000');
});

it('never counts or values another business\'s shelves', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner);
    stocked(onHand: 4, reorderPoint: 1, cost: 5.0);

    $other = Business::factory()->create(['name' => 'Elsewhere Trading']);

    CurrentBusiness::get()->run($other->id, function (): void {
        BusinessSetting::ensureExists(['company_name' => 'Elsewhere Trading', 'currency' => 'BHD']);
        stocked(onHand: 100, reorderPoint: 500, cost: 50.0);
    });

    $this->actingAs($owner)
        ->getJson('/api/v1/inventory')
        ->assertOk()
        ->assertJsonPath('totals.items', 1)
        ->assertJsonPath('totals.low', 0)
        ->assertJsonPath('totals.value', '20.000');
});
