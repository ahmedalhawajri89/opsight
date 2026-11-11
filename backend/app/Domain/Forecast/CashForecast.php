<?php

declare(strict_types=1);

namespace App\Domain\Forecast;

use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentStatus;
use App\Models\BusinessSetting;
use App\Support\Money;
use App\Support\Tenancy\TenantQuery;
use Carbon\CarbonImmutable;

/**
 * Thirteen weeks of cash, in and out (phase D2).
 *
 * WHAT IT ADDS UP, EACH FROM THE BUSINESS'S OWN HISTORY:
 *
 *  IN   what customers already owe, dated by how fast THIS business's
 *       customers actually pay (the amount-weighted median from the
 *       payments ledger); and the sales still to come, at a weekly rate
 *       weighted toward recent weeks, collected over the weeks that history
 *       says payment arrives in.
 *
 *  OUT  recurring expenses — any category that appeared in at least four of
 *       the last six months — on their usual day at their usual amount;
 *       the rest at their weekly average; and the stock the stock forecast
 *       says must be ordered, in the week it must be ordered.
 *
 * Every assumption is returned with the figures, so the screen can show
 * the owner what the forecast believes and they can judge it: a forecast
 * that hides its assumptions cannot be argued with, and so cannot be
 * trusted either.
 *
 * Not included, and said so: VAT settlements, loan repayments, owner
 * drawings and anything else the system does not record.
 */
final class CashForecast
{
    public const WEEKS = 13;

    /** Lags are bucketed into whole weeks, the last bucket holding the rest. */
    private const LAG_BUCKETS = 5;

    public function __construct(private readonly StockForecast $stock) {}

    /** @return array<string, mixed> */
    public function for(?CarbonImmutable $now = null): array
    {
        $settings = BusinessSetting::current();
        $timezone = $settings->timezone ?: 'UTC';
        $today = ($now ?? CarbonImmutable::now())->setTimezone($timezone)->startOfDay();
        $start = $today->startOfWeek($settings->weekStartCarbonDay());

        $weeks = [];

        for ($w = 0; $w < self::WEEKS; $w++) {
            $weeks[$w] = [
                'start' => $start->addWeeks($w)->toDateString(),
                'end' => $start->addWeeks($w)->addDays(6)->toDateString(),
                'receivables' => 0.0, 'sales' => 0.0,
                'recurring' => 0.0, 'other_expenses' => 0.0, 'stock' => 0.0,
            ];
        }

        $weekOf = static function (CarbonImmutable $date) use ($start): ?int {
            $index = (int) floor($start->diffInDays($date->startOfDay(), false) / 7);

            return $index >= 0 && $index < self::WEEKS ? $index : null;
        };

        [$shares, $medianLag] = $this->paymentLag($today, $timezone);
        $overdue = $this->receivables($weeks, $weekOf, $today, $timezone, $medianLag);
        $weeklySales = $this->sales($weeks, $shares, $start, $timezone);
        $recurring = $this->expenses($weeks, $weekOf, $today, $start, $timezone);
        $stock = $this->stockOrders($weeks, $weekOf, $today);

        $balance = $settings->cash_balance !== null ? (float) $settings->cash_balance : null;
        $running = $balance ?? 0.0;
        $lowest = null;
        $firstNegative = null;
        $totals = ['in' => 0.0, 'out' => 0.0];
        $out = [];

        foreach ($weeks as $w => $week) {
            $in = $week['receivables'] + $week['sales'];
            $spent = $week['recurring'] + $week['other_expenses'] + $week['stock'];
            $running += $in - $spent;
            $totals['in'] += $in;
            $totals['out'] += $spent;

            if ($lowest === null || $running < $lowest['value']) {
                $lowest = ['week' => $w, 'value' => $running];
            }

            if ($balance !== null && $firstNegative === null && $running < 0) {
                $firstNegative = $w;
            }

            $out[] = [
                'start' => $week['start'],
                'end' => $week['end'],
                'in' => ['receivables' => $this->money($week['receivables']), 'sales' => $this->money($week['sales']), 'total' => $this->money($in)],
                'out' => [
                    'recurring' => $this->money($week['recurring']),
                    'other_expenses' => $this->money($week['other_expenses']),
                    'stock' => $this->money($week['stock']),
                    'total' => $this->money($spent),
                ],
                'net' => $this->money($in - $spent),
                // With no opening balance this is the running total of net
                // flow from zero: the shape of the quarter, not its level.
                'running' => $this->money($running),
            ];
        }

        return [
            'generated_for' => $today->toDateString(),
            'opening_balance' => $balance !== null ? $this->money($balance) : null,
            'opening_balance_as_of' => $settings->cash_balance_as_of?->toDateString(),
            'weeks' => $out,
            'totals' => ['in' => $this->money($totals['in']), 'out' => $this->money($totals['out']), 'net' => $this->money($totals['in'] - $totals['out'])],
            'lowest' => $lowest === null ? null : ['week' => $lowest['week'], 'start' => $out[$lowest['week']]['start'], 'value' => $this->money($lowest['value'])],
            'first_negative_week' => $firstNegative === null ? null : ['week' => $firstNegative, 'start' => $out[$firstNegative]['start']],
            'assumptions' => [
                'median_days_to_pay' => $medianLag,
                'paid_within_week' => round($shares[0], 3),
                'weekly_sales' => $this->money($weeklySales),
                'overdue_receivables' => $this->money($overdue),
                'recurring' => $recurring,
                'stock_orders' => $stock,
            ],
        ];
    }

    /**
     * How long payment takes, from the last six months of the ledger: the
     * share of money arriving in the week of the sale, the week after, and so
     * on, and the amount-weighted median in days.
     *
     * @return array{0: list<float>, 1: int}
     */
    private function paymentLag(CarbonImmutable $today, string $timezone): array
    {
        $rows = TenantQuery::table('order_payments')
            ->join('orders', 'orders.id', '=', 'order_payments.order_id')
            ->where('order_payments.paid_at', '>=', $today->subDays(180)->utc()->toDateTimeString())
            ->whereNotNull('orders.placed_at')
            ->get(['order_payments.amount', 'order_payments.paid_at', 'orders.placed_at']);

        $buckets = array_fill(0, self::LAG_BUCKETS, 0.0);
        $lags = [];
        $total = 0.0;

        foreach ($rows as $row) {
            $placed = CarbonImmutable::parse((string) $row->placed_at, 'UTC')->setTimezone($timezone)->startOfDay();
            $paid = CarbonImmutable::parse((string) $row->paid_at, 'UTC')->setTimezone($timezone)->startOfDay();
            $days = max(0, (int) $placed->diffInDays($paid, false));
            $amount = (float) $row->amount;

            $buckets[min(self::LAG_BUCKETS - 1, intdiv($days, 7))] += $amount;
            $lags[] = [$days, $amount];
            $total += $amount;
        }

        if ($total <= 0) {
            // No history: assume payment in the week of the sale.
            return [[1.0, 0.0, 0.0, 0.0, 0.0], 0];
        }

        usort($lags, static fn (array $a, array $b): int => $a[0] <=> $b[0]);
        $half = $total / 2;
        $median = 0;

        foreach ($lags as [$days, $amount]) {
            $half -= $amount;
            $median = $days;

            if ($half <= 0) {
                break;
            }
        }

        return [array_map(static fn (float $b): float => $b / $total, $buckets), $median];
    }

    /**
     * What customers owe today, placed in the week it should arrive.
     *
     * AN AMOUNT ALREADY PAST ITS EXPECTED DAY IS NOT COUNTED. The first run
     * put 152,777 of overdue receivables into the current week, and the
     * whole quarter looked comfortable on money that, by definition, has
     * not come when it should have. A cash forecast is read to avoid running
     * out; it has to be conservative. Overdue money is returned separately,
     * shown beside the forecast, and left out of it.
     *
     * @param  array<array-key, array<string, mixed>>  $weeks
     */
    private function receivables(array &$weeks, callable $weekOf, CarbonImmutable $today, string $timezone, int $medianLag): float
    {
        $rows = TenantQuery::table('orders')
            ->whereIn('status', OrderStatus::qualifying())
            ->whereNotNull('placed_at')
            ->selectRaw('placed_at, '.PaymentStatus::outstandingSql().' AS owed')
            ->get();

        $overdue = 0.0;

        foreach ($rows as $row) {
            $owed = (float) $row->owed;

            if ($owed <= 0) {
                continue;
            }

            $due = CarbonImmutable::parse((string) $row->placed_at, 'UTC')->setTimezone($timezone)->addDays($medianLag);

            if ($due->lessThan($today)) {
                $overdue += $owed;

                continue;
            }

            $w = $weekOf($due);

            if ($w !== null) {
                $weeks[$w]['receivables'] += $owed;
            }
        }

        return $overdue;
    }

    /**
     * Sales still to come, collected over the weeks history says payment
     * takes. The weekly rate weights the last eight weeks toward the latest.
     *
     * @param  array<array-key, array<string, mixed>>  $weeks
     * @param  list<float>  $shares
     */
    private function sales(array &$weeks, array $shares, CarbonImmutable $start, string $timezone): float
    {
        $from = $start->subWeeks(8);

        $rows = TenantQuery::table('orders')
            ->whereIn('status', OrderStatus::qualifying())
            ->where('placed_at', '>=', $from->utc()->toDateTimeString())
            ->get(['placed_at', 'total_amount']);

        $history = array_fill(0, 8, 0.0);
        $thisWeek = 0.0;

        foreach ($rows as $row) {
            $local = CarbonImmutable::parse((string) $row->placed_at, 'UTC')->setTimezone($timezone)->startOfDay();
            $index = (int) floor($from->diffInDays($local, false) / 7);

            if ($index >= 0 && $index < 8) {
                $history[$index] += (float) $row->total_amount;
            } elseif ($index === 8) {
                $thisWeek += (float) $row->total_amount;
            }
        }

        $rate = null;

        foreach ($history as $value) {
            $rate = $rate === null ? $value : 0.3 * $value + 0.7 * $rate;
        }

        $rate = (float) $rate;

        for ($w = 0; $w < self::WEEKS; $w++) {
            // This week's sales already placed are owed or paid, so only the
            // rest of the week's expected sales are still to come.
            $expected = $w === 0 ? max(0.0, $rate - $thisWeek) : $rate;

            foreach ($shares as $lag => $share) {
                if ($w + $lag < self::WEEKS) {
                    $weeks[$w + $lag]['sales'] += $expected * $share;
                }
            }
        }

        return $rate;
    }

    /**
     * Expenses: a category seen in four of the last six months is recurring,
     * paid on its usual day at its usual (median) amount; the rest are spread
     * at their weekly average over the last twelve weeks.
     *
     * @param  array<array-key, array<string, mixed>>  $weeks
     * @return list<array{category: string, amount: string, day: int}>
     */
    private function expenses(array &$weeks, callable $weekOf, CarbonImmutable $today, CarbonImmutable $start, string $timezone): array
    {
        $monthStart = $today->startOfMonth();
        $sixMonths = $monthStart->subMonths(6);

        $rows = TenantQuery::table('expenses')
            ->join('expense_categories', 'expense_categories.id', '=', 'expenses.expense_category_id')
            ->where('expenses.incurred_on', '>=', $sixMonths->toDateString())
            ->get(['expenses.expense_category_id', 'expense_categories.name', 'expenses.amount', 'expenses.incurred_on']);

        $byCategory = [];

        foreach ($rows as $row) {
            $date = CarbonImmutable::parse((string) $row->incurred_on, $timezone);
            $key = (int) $row->expense_category_id;
            $byCategory[$key] ??= ['name' => (string) $row->name, 'months' => [], 'days' => [], 'recent' => 0.0, 'this_month' => false];

            if ($date->greaterThanOrEqualTo($monthStart)) {
                $byCategory[$key]['this_month'] = true;
            } else {
                $month = $date->format('Y-m');
                $byCategory[$key]['months'][$month] = ($byCategory[$key]['months'][$month] ?? 0.0) + (float) $row->amount;
                $byCategory[$key]['days'][] = $date->day;
            }

            if ($date->greaterThanOrEqualTo($start->subWeeks(12)) && $date->lessThan($start)) {
                $byCategory[$key]['recent'] += (float) $row->amount;
            }
        }

        $recurring = [];

        foreach ($byCategory as $category) {
            if (count($category['months']) >= 4) {
                $amount = $this->median(array_values($category['months']));
                $day = (int) round($this->median($category['days']));

                for ($m = 0; $m < 4; $m++) {
                    $month = $monthStart->addMonths($m);

                    // Already paid this month: the next one is next month.
                    if ($m === 0 && $category['this_month']) {
                        continue;
                    }

                    $date = $month->setDay(min($day, $month->daysInMonth));

                    if ($date->lessThan($today)) {
                        $date = $today; // due this month and not yet seen: assume now
                    }

                    $w = $weekOf($date);

                    if ($w !== null) {
                        $weeks[$w]['recurring'] += $amount;
                    }
                }

                $recurring[] = ['category' => $category['name'], 'amount' => $this->money($amount), 'day' => $day];

                continue;
            }

            $weekly = $category['recent'] / 12;

            foreach ($weeks as $w => $week) {
                $weeks[$w]['other_expenses'] += $weekly;
            }
        }

        usort($recurring, static fn (array $a, array $b): int => (float) $b['amount'] <=> (float) $a['amount']);

        return $recurring;
    }

    /**
     * Stock the stock forecast says must be ordered, paid for in the week the
     * order goes in.
     *
     * @param  array<array-key, array<string, mixed>>  $weeks
     * @return array{count: int, total: string}
     */
    private function stockOrders(array &$weeks, callable $weekOf, CarbonImmutable $today): array
    {
        $count = 0;
        $total = 0.0;

        foreach ($this->stock->for(7, 30, true, $today)['items'] as $item) {
            $cost = (float) ($item['suggested_cost'] ?? 0);

            if ($cost <= 0) {
                continue;
            }

            $w = $weekOf(CarbonImmutable::parse((string) $item['order_by'], $today->getTimezone()));

            if ($w !== null) {
                $weeks[$w]['stock'] += $cost;
                $count++;
                $total += $cost;
            }
        }

        return ['count' => $count, 'total' => $this->money($total)];
    }

    /** @param list<int|float> $values */
    private function median(array $values): float
    {
        sort($values);
        $n = count($values);

        if ($n === 0) {
            return 0.0;
        }

        return $n % 2 ? (float) $values[intdiv($n, 2)] : ($values[$n / 2 - 1] + $values[$n / 2]) / 2;
    }

    private function money(float $value): string
    {
        return Money::round(number_format($value, 4, '.', ''));
    }
}
