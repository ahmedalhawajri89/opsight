<?php

declare(strict_types=1);

namespace App\Domain\Reports;

use App\Domain\Forecast\CashForecast;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\Period;
use App\Models\BusinessSetting;
use App\Models\User;
use App\Support\Money;
use App\Support\Tenancy\TenantQuery;
use Carbon\CarbonImmutable;

/**
 * The report a business hands a lender (phase D3).
 *
 * WHAT A LENDER ASKS, IN THE ORDER THEY ASK IT: who the business is; whether
 * it makes money (twelve complete months of profit and loss, month by
 * month, with the year before for growth); what it holds and is owed today;
 * and whether the cash lasts (the thirteen-week forecast, with every
 * assumption it rests on).
 *
 * EVERY FIGURE COMES FROM THE SAME FUNCTIONS AS THE DASHBOARD. A report that
 * computed its own revenue would be a second definition of revenue, and the
 * day the two disagreed the owner would be holding a document that
 * contradicts the screen it came from.
 *
 * AND IT SAYS WHAT IT DOES NOT KNOW. Sales recorded with no cost make gross
 * profit look better than it is; a cash forecast with no stated balance is
 * a shape, not a level. Both are written into the report, because a lender
 * who finds them unstated will doubt everything else in it.
 */
final class FinancingReport
{
    public const MONTHS = 12;

    public function __construct(
        private readonly MetricCalculator $metrics,
        private readonly CashForecast $cash,
    ) {}

    /** @return array<string, mixed> */
    public function for(User $preparedBy, ?CarbonImmutable $now = null): array
    {
        $settings = BusinessSetting::current();
        $timezone = $settings->timezone ?: 'UTC';
        $now = ($now ?? CarbonImmutable::now())->setTimezone($timezone);

        // Complete months only: a month still running, set beside eleven
        // finished ones, reads as a collapse.
        $lastMonth = $now->startOfMonth()->subMonth();
        $first = $lastMonth->subMonths(self::MONTHS - 1);

        $months = [];

        for ($m = 0; $m < self::MONTHS; $m++) {
            $start = $first->addMonths($m);
            $months[] = ['month' => $start->format('Y-m')] + $this->profitAndLoss(
                Period::between($start->toDateString(), $start->endOfMonth()->toDateString(), $timezone),
            );
        }

        $year = Period::between($first->toDateString(), $lastMonth->endOfMonth()->toDateString(), $timezone);
        $prior = Period::between(
            $first->subMonths(self::MONTHS)->toDateString(),
            $first->subDay()->toDateString(),
            $timezone,
        );

        $totals = $this->profitAndLoss($year);
        $before = $this->profitAndLoss($prior);

        $expenses = $this->metrics->operatingExpensesByCategory($year);
        uasort($expenses, static fn (string $a, string $b): int => bccomp($b, $a, Money::scale()));

        return [
            'business' => [
                'name' => $settings->company_name,
                'commercial_registration' => $settings->commercial_registration,
                'vat_number' => $settings->vat_enabled ? $settings->vat_number : null,
                'currency' => $settings->currency,
                'decimals' => (int) $settings->currency_decimals,
            ],
            'prepared_by' => $preparedBy->name,
            'generated_at' => $now->toIso8601String(),
            'period' => ['from' => $year->from, 'to' => $year->to],
            'months' => $months,
            'totals' => $totals + [
                'gross_margin' => $this->ratio($totals['gross_profit'], $totals['net_revenue']),
                'net_margin' => $this->ratio($totals['net_profit'], $totals['net_revenue']),
                'orders' => $this->metrics->ordersCount($year),
            ],
            'prior' => [
                'from' => $prior->from,
                'to' => $prior->to,
                'net_revenue' => $before['net_revenue'],
                'net_profit' => $before['net_profit'],
                // Growth only against a year that sold something: against
                // zero, every business grows infinitely.
                'revenue_growth' => bccomp($before['net_revenue'], '0', Money::scale()) > 0
                    ? $this->ratio(bcsub($totals['net_revenue'], $before['net_revenue'], Money::scale()), $before['net_revenue'])
                    : null,
            ],
            'expenses_by_category' => array_map(
                static fn (string $name, string $amount): array => ['category' => $name, 'amount' => Money::round($amount)],
                array_keys($expenses),
                array_values($expenses),
            ),
            'position' => [
                'cash_balance' => $settings->cash_balance !== null ? Money::round((string) $settings->cash_balance) : null,
                'cash_balance_as_of' => $settings->cash_balance_as_of?->toDateString(),
                'receivables' => Money::round($this->metrics->receivables()),
                'inventory_value' => $this->inventoryValue(),
            ],
            'cash_forecast' => $this->cash->for($now),
            'caveats' => [
                'zero_cost_items' => $this->metrics->zeroCostItemCount($year),
            ],
        ];
    }

    /** @return array{net_revenue: string, cogs: string, gross_profit: string, operating_expenses: string, net_profit: string} */
    private function profitAndLoss(Period $period): array
    {
        return [
            'net_revenue' => Money::round($this->metrics->netRevenue($period)),
            'cogs' => Money::round($this->metrics->cogs($period)),
            'gross_profit' => Money::round($this->metrics->grossProfit($period)),
            'operating_expenses' => Money::round($this->metrics->operatingExpenses($period)),
            'net_profit' => Money::round($this->metrics->netProfit($period)),
        ];
    }

    private function ratio(string $part, string $whole): ?float
    {
        if (bccomp($whole, '0', Money::scale()) <= 0) {
            return null;
        }

        return round((float) bcdiv($part, $whole, 10), 4);
    }

    /** Today's stock at catalogue cost, as the dashboard values it. */
    private function inventoryValue(): string
    {
        return Money::round((string) (TenantQuery::table('inventory_items')
            ->join('products', 'products.id', '=', 'inventory_items.product_id')
            ->whereNull('products.deleted_at')
            ->selectRaw('COALESCE(SUM(ROUND(inventory_items.stock_on_hand * products.cost, '.Money::scale().')), 0) AS total')
            ->value('total') ?? Money::zero()));
    }
}
