<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\Period;
use App\Domain\Orders\OrderStatus;
use App\Domain\Reports\FinancingReport;
use App\Models\ActivityLog;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\User;
use App\Support\Money;
use Carbon\CarbonImmutable;

/*
|--------------------------------------------------------------------------
| The report a business hands a lender (phase D3)
|--------------------------------------------------------------------------
|
| Twelve complete months, from the same functions as the dashboard, with
| what it does not know written in.
|
*/

function reportNow(): CarbonImmutable
{
    return CarbonImmutable::parse('2026-11-11 10:00', 'Asia/Bahrain');
}

function financingReport(?User $user = null): array
{
    return app(FinancingReport::class)->for($user ?? User::factory()->role(Role::Owner)->create(), reportNow());
}

it('covers the twelve complete months before this one', function (): void {
    $report = financingReport();

    expect($report['months'])->toHaveCount(12)
        ->and($report['months'][0]['month'])->toBe('2025-11')
        ->and($report['months'][11]['month'])->toBe('2026-10')
        ->and($report['period'])->toBe(['from' => '2025-11-01', 'to' => '2026-10-31']);
});

it('agrees with the dashboard, figure for figure', function (): void {
    Order::factory()->create([
        'status' => OrderStatus::Confirmed,
        'placed_at' => CarbonImmutable::parse('2026-10-15 12:00', 'Asia/Bahrain')->utc(),
        'total_amount' => '500',
    ]);
    Expense::factory()->create([
        'expense_category_id' => ExpenseCategory::factory()->create(['name' => 'Rent'])->id,
        'amount' => '200',
        'incurred_on' => '2026-10-04',
    ]);

    $report = financingReport();
    $october = Period::between('2026-10-01', '2026-10-31', 'Asia/Bahrain');
    $metrics = app(MetricCalculator::class);

    expect($report['months'][11]['net_revenue'])->toBe(Money::round($metrics->netRevenue($october)))
        ->and($report['months'][11]['operating_expenses'])->toBe('200.000')
        ->and($report['months'][11]['net_profit'])->toBe(Money::round($metrics->netProfit($october)))
        ->and($report['expenses_by_category'][0])->toBe(['category' => 'Rent', 'amount' => '200.000']);
});

it('leaves out a month still running', function (): void {
    Order::factory()->create([
        'status' => OrderStatus::Confirmed,
        'placed_at' => reportNow()->subDay()->utc(),
        'total_amount' => '999',
    ]);

    expect(financingReport()['totals']['net_revenue'])->toBe('0.000');
});

it('states no growth against a year that sold nothing', function (): void {
    expect(financingReport()['prior']['revenue_growth'])->toBeNull();
});

it('carries the cash forecast and what it does not know', function (): void {
    $report = financingReport();

    expect($report['cash_forecast']['weeks'])->toHaveCount(13)
        ->and($report['position']['cash_balance'])->toBeNull()
        ->and($report['caveats'])->toHaveKey('zero_cost_items');
});

it('is for a role that may see cost, and every one drawn up is logged', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create())->getJson('/api/v1/reports/financing')
        ->assertOk()
        ->assertJsonStructure(['data' => ['business', 'months', 'totals', 'position', 'cash_forecast']]);

    $this->actingAs(User::factory()->role(Role::Staff)->create())->getJson('/api/v1/reports/financing')->assertForbidden();

    expect(ActivityLog::query()->where('action', 'report.financing_generated')->count())->toBe(1);
});
