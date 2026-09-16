<?php

declare(strict_types=1);

use App\Domain\Orders\ConfirmOrder;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;

beforeEach(function (): void {
    $this->actingAs(User::factory()->manager()->create());
});

/*
|--------------------------------------------------------------------------
| Unknown keys are rejected, never ignored
|--------------------------------------------------------------------------
|
| Silently ignoring an unknown filter hides bugs from the developer and probing
| from the log, and leaves the caller believing a filter applied when it did
| not (ARCHITECTURE.md §4).
|
*/

it('rejects an unknown filter with 422 rather than ignoring it', function (): void {
    Product::factory()->count(3)->create();

    $this->getJson('/api/v1/products?filter[nonsense]=x')
        ->assertStatus(422)
        ->assertJsonPath('code', 'validation.failed')
        ->assertJsonValidationErrors('filter');
});

it('names the allowed filters in the error, so the caller can correct it', function (): void {
    $response = $this->getJson('/api/v1/orders?filter[colour]=red')->assertStatus(422);

    expect($response->json('errors.filter.0'))->toContain('status');
});

it('rejects sorting by a column that is not on the allowlist', function (): void {
    // Without an allowlist this would be a path to ordering by cost — a column
    // some roles may not even read.
    $this->getJson('/api/v1/products?sort=cost')
        ->assertStatus(422)
        ->assertJsonValidationErrors('sort');
});

it('rejects a malformed filter parameter', function (): void {
    $this->getJson('/api/v1/products?filter=notanarray')
        ->assertStatus(422)
        ->assertJsonValidationErrors('filter');
});

/*
|--------------------------------------------------------------------------
| Filters actually narrow
|--------------------------------------------------------------------------
*/

it('filters orders by status', function (): void {
    $product = Product::factory()->withStock(50)->create();

    $confirmed = Order::factory()->create();
    $confirmed->items()->create([
        'product_id' => $product->id, 'product_name' => $product->name,
        'product_sku' => $product->sku, 'unit_price' => $product->price,
        'unit_cost' => $product->cost, 'quantity' => 1,
        'line_discount' => 0, 'line_total' => 0,
    ]);
    app(ConfirmOrder::class)($confirmed);

    Order::factory()->count(2)->create();   // drafts

    $this->getJson('/api/v1/orders?filter[status]=draft')
        ->assertOk()
        ->assertJsonCount(2, 'data');

    $this->getJson('/api/v1/orders?filter[status]=confirmed')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('accepts a comma-separated set for an exact filter', function (): void {
    Order::factory()->count(3)->create();

    $this->getJson('/api/v1/orders?filter[status]=draft,confirmed')
        ->assertOk()
        ->assertJsonCount(3, 'data');
});

it('searches products by name and sku', function (): void {
    Product::factory()->create(['name' => 'Laptop X', 'sku' => 'LAP-001']);
    Product::factory()->create(['name' => 'Desk Lamp', 'sku' => 'LMP-002']);

    $this->getJson('/api/v1/products?filter[search]=Laptop')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.sku', 'LAP-001');

    $this->getJson('/api/v1/products?filter[search]=LMP')
        ->assertOk()
        ->assertJsonCount(1, 'data');
});

it('treats a percent sign in a search as a literal, not a wildcard', function (): void {
    Product::factory()->create(['name' => 'Normal Product']);
    Product::factory()->create(['name' => '50% Discount Bundle']);

    // Without escaping, "%" would match everything.
    $this->getJson('/api/v1/products?filter[search]=%25')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.name', '50% Discount Bundle');
});

it('filters expenses on the business date, not the entry date', function (): void {
    $category = ExpenseCategory::factory()->create();

    Expense::factory()->create([
        'expense_category_id' => $category->id,
        'incurred_on' => '2026-08-15',
    ]);
    Expense::factory()->create([
        'expense_category_id' => $category->id,
        'incurred_on' => '2026-09-15',
    ]);

    $this->getJson('/api/v1/expenses?filter[incurred_from]=2026-08-01&filter[incurred_to]=2026-08-31')
        ->assertOk()
        ->assertJsonCount(1, 'data')
        ->assertJsonPath('data.0.incurred_on', '2026-08-15');
});

/*
|--------------------------------------------------------------------------
| Sorting
|--------------------------------------------------------------------------
*/

it('sorts ascending and descending on an allowlisted field', function (): void {
    Product::factory()->create(['name' => 'Alpha']);
    Product::factory()->create(['name' => 'Zulu']);

    expect($this->getJson('/api/v1/products?sort=name')->json('data.0.name'))->toBe('Alpha');
    expect($this->getJson('/api/v1/products?sort=-name')->json('data.0.name'))->toBe('Zulu');
});

/*
|--------------------------------------------------------------------------
| Pagination
|--------------------------------------------------------------------------
*/

it('returns pagination meta the client can render', function (): void {
    Customer::factory()->count(30)->create();

    $response = $this->getJson('/api/v1/customers?per_page=10&page=2')->assertOk();

    $response->assertJsonCount(10, 'data')
        ->assertJsonPath('meta.current_page', 2)
        ->assertJsonPath('meta.per_page', 10)
        ->assertJsonPath('meta.total', 30)
        ->assertJsonPath('meta.last_page', 3);
});

it('caps per_page rather than erroring, because the caller wants as many as they can have', function (): void {
    Customer::factory()->count(5)->create();

    $this->getJson('/api/v1/customers?per_page=5000')
        ->assertOk()
        ->assertJsonPath('meta.per_page', 100);
});

it('falls back to the default for a nonsensical per_page', function (): void {
    Customer::factory()->count(3)->create();

    $this->getJson('/api/v1/customers?per_page=-5')
        ->assertOk()
        ->assertJsonPath('meta.per_page', 25);
});
