<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;

/*
|--------------------------------------------------------------------------
| What the expenses add up to
|--------------------------------------------------------------------------
|
| The one question this screen exists to answer, and it could not. Somebody
| filtering to "Payroll, this quarter" got a page of rows and added them up
| by eye — over the first twenty-five, which is not the quarter.
|
| Every figure is counted by the server over the whole filtered set. A sum
| of the page presented as a sum of the set is wrong by however many pages
| there are, and most wrong on the largest sets.
|
*/

function expenseOn(string $date, float $amount, ?ExpenseCategory $category = null): Expense
{
    return Expense::factory()->create([
        'expense_category_id' => ($category ?? ExpenseCategory::factory()->create())->id,
        'amount' => $amount,
        'incurred_on' => $date,
    ]);
}

it('totals every expense that matched, not the page in front of the reader', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    expenseOn('2026-01-05', 100.0);
    expenseOn('2026-01-06', 250.5);
    expenseOn('2026-01-07', 49.5);

    $response = $this->getJson('/api/v1/expenses?per_page=1')->assertOk();

    $response->assertJsonCount(1, 'data');
    $response->assertJsonPath('totals.expenses', 3);
    $response->assertJsonPath('totals.amount', '400.000');
});

it('counts exactly what the paginator counts', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    foreach (range(1, 6) as $ignored) {
        expenseOn('2026-02-01', 10.0);
    }

    $response = $this->getJson('/api/v1/expenses?per_page=2')->assertOk();

    expect($response->json('totals.expenses'))->toBe($response->json('meta.total'));
});

it('follows the date range, which is the filter this screen is used with', function (): void {
    /*
     * "How much did we spend in February" is the question. A total that
     * ignored the range would answer a different one while looking correct.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    expenseOn('2026-01-31', 999.0);
    expenseOn('2026-02-10', 120.0);
    expenseOn('2026-02-20', 80.0);
    expenseOn('2026-03-01', 777.0);

    $this->getJson('/api/v1/expenses?filter[incurred_from]=2026-02-01&filter[incurred_to]=2026-02-28')
        ->assertOk()
        ->assertJsonPath('totals.expenses', 2)
        ->assertJsonPath('totals.amount', '200.000');
});

it('follows the category filter too', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    $payroll = ExpenseCategory::factory()->create(['name' => 'Payroll']);
    $rent = ExpenseCategory::factory()->create(['name' => 'Rent']);

    expenseOn('2026-04-01', 5000.0, $payroll);
    expenseOn('2026-04-02', 1500.0, $rent);

    $this->getJson("/api/v1/expenses?filter[expense_category_id]={$payroll->id}")
        ->assertOk()
        ->assertJsonPath('totals.expenses', 1)
        ->assertJsonPath('totals.amount', '5000.000');
});

it('reports zero rather than null when nothing matched', function (): void {
    /*
     * SUM over no rows is NULL in SQL, and a null reaching the screen
     * renders as a blank where a reader expects a figure.
     */
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    $this->getJson('/api/v1/expenses?filter[search]=nothing-matches-this')
        ->assertOk()
        ->assertJsonPath('totals.expenses', 0)
        ->assertJsonPath('totals.amount', '0.000');
});

it('never totals another business\'s spending', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner);
    expenseOn('2026-05-05', 300.0);

    $other = Business::factory()->create(['name' => 'Elsewhere Trading']);

    CurrentBusiness::get()->run($other->id, function (): void {
        BusinessSetting::ensureExists(['company_name' => 'Elsewhere Trading', 'currency' => 'BHD']);
        expenseOn('2026-05-06', 90000.0);
    });

    $this->actingAs($owner)
        ->getJson('/api/v1/expenses')
        ->assertOk()
        ->assertJsonPath('totals.expenses', 1)
        ->assertJsonPath('totals.amount', '300.000');
});
