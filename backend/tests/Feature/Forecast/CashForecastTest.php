<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Forecast\CashForecast;
use App\Domain\Orders\OrderStatus;
use App\Models\ActivityLog;
use App\Models\BusinessSetting;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\User;
use Carbon\CarbonImmutable;

/*
|--------------------------------------------------------------------------
| Thirteen weeks of cash (phase D2)
|--------------------------------------------------------------------------
|
| Conservative by design: money already overdue is shown, not counted. And
| every assumption comes back with the figures.
|
*/

function cashToday(): CarbonImmutable
{
    return CarbonImmutable::parse('2026-11-11 10:00', 'Asia/Bahrain');
}

function cashForecast(): array
{
    return app(CashForecast::class)->for(cashToday());
}

/** An order placed on a day, for a total, with what has been paid and when. */
function cashOrder(CarbonImmutable $placed, string $total, ?CarbonImmutable $paidAt = null, ?string $paid = null): Order
{
    $order = Order::factory()->create([
        'status' => OrderStatus::Confirmed,
        'placed_at' => $placed->utc(),
        'total_amount' => $total,
        'amount_paid' => $paid ?? '0',
    ]);

    if ($paidAt !== null) {
        $order->payments()->create(['amount' => $paid, 'method' => 'cash', 'paid_at' => $paidAt->utc()]);
    }

    return $order;
}

it('learns how long this business\'s customers take to pay', function (): void {
    // Two orders, each paid ten days after it was placed.
    cashOrder(cashToday()->subDays(40), '100', cashToday()->subDays(30), '100');
    cashOrder(cashToday()->subDays(30), '100', cashToday()->subDays(20), '100');

    $assumptions = cashForecast()['assumptions'];

    expect($assumptions['median_days_to_pay'])->toBe(10)
        ->and($assumptions['paid_within_week'])->toBe(0.0);
});

it('dates what is owed by that habit, in the week it should arrive', function (): void {
    cashOrder(cashToday()->subDays(40), '100', cashToday()->subDays(30), '100');
    // Placed yesterday, unpaid: due in ten days.
    cashOrder(cashToday()->subDay(), '500');

    $weeks = cashForecast()['weeks'];
    $due = cashToday()->subDay()->addDays(10)->toDateString();
    $week = collect($weeks)->first(fn (array $w): bool => $w['start'] <= $due && $w['end'] >= $due);

    expect($week['in']['receivables'])->toBe('500.000');
});

it('shows overdue money beside the forecast and leaves it out of it', function (): void {
    /*
     * Money already past its expected day may not come. Counting it would
     * make the quarter look comfortable on exactly the cash that has not
     * arrived when it should have.
     */
    cashOrder(cashToday()->subDays(60), '900');

    $forecast = cashForecast();

    expect($forecast['assumptions']['overdue_receivables'])->toBe('900.000')
        ->and(collect($forecast['weeks'])->sum(fn (array $w): float => (float) $w['in']['receivables']))->toBe(0.0);
});

it('finds a monthly expense and puts it on its usual day', function (): void {
    $rent = ExpenseCategory::factory()->create(['name' => 'Rent']);

    // The 4th of each of the last six months, 2,000 each time.
    for ($m = 1; $m <= 6; $m++) {
        Expense::factory()->create([
            'expense_category_id' => $rent->id,
            'amount' => '2000',
            'incurred_on' => cashToday()->startOfMonth()->subMonths($m)->setDay(4)->toDateString(),
        ]);
    }

    $forecast = cashForecast();
    $december = '2026-12-04';
    $week = collect($forecast['weeks'])->first(fn (array $w): bool => $w['start'] <= $december && $w['end'] >= $december);

    expect($forecast['assumptions']['recurring'])->toContain(['category' => 'Rent', 'amount' => '2000.000', 'day' => 4])
        ->and($week['out']['recurring'])->toBe('2000.000');
});

it('starts from the stated balance and names the first week it would go negative', function (): void {
    BusinessSetting::current()->forceFill(['cash_balance' => '1000', 'cash_balance_as_of' => '2026-11-11'])->save();
    $rent = ExpenseCategory::factory()->create();

    for ($m = 1; $m <= 6; $m++) {
        Expense::factory()->create([
            'expense_category_id' => $rent->id,
            'amount' => '1500',
            'incurred_on' => cashToday()->startOfMonth()->subMonths($m)->setDay(4)->toDateString(),
        ]);
    }

    $forecast = cashForecast();

    expect($forecast['opening_balance'])->toBe('1000.000')
        ->and($forecast['first_negative_week'])->not->toBeNull()
        ->and($forecast['first_negative_week']['start'] <= '2026-12-04')->toBeTrue()
        ->and((float) $forecast['lowest']['value'])->toBeLessThan(0.0);
});

it('without a balance, shows the running net flow from zero', function (): void {
    $forecast = cashForecast();

    expect($forecast['opening_balance'])->toBeNull()
        ->and($forecast['first_negative_week'])->toBeNull()
        ->and($forecast['weeks'])->toHaveCount(13);
});

it('serves the cash forecast only to a role that may see cost', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create())->getJson('/api/v1/forecasts/cash')->assertOk();
    $this->actingAs(User::factory()->role(Role::Staff)->create())->getJson('/api/v1/forecasts/cash')->assertForbidden();
});

it('lets the owner state the cash in hand, and clear it, with an audit', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => '25000.5', 'as_of' => '2026-11-10'])
        ->assertOk()
        ->assertJsonPath('data.cash_balance', '25000.500');

    $this->actingAs($owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => null])
        ->assertOk()
        ->assertJsonPath('data.cash_balance', null);

    expect(ActivityLog::query()->where('action', 'forecast.cash_balance_set')->count())->toBe(2);
});

it('keeps the balance from anyone who may not change the settings', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();

    $this->actingAs($analyst)->putJson('/api/v1/forecasts/cash/balance', ['amount' => '1'])->assertForbidden();
});
