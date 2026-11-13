<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Domain\Orders\OrderStatus;
use App\Support\Money;
use App\Support\Tenancy\TenantQuery;
use Illuminate\Support\Carbon;

/**
 * The dashboard's figures that are not a single metric over the period.
 *
 * Every number here is worked out on the server, so the screen does no money
 * arithmetic: sales by where they came from, operating expenses by category,
 * net profit per bucket, the best day and the average day.
 *
 * Channel revenue uses the same order-level definition as TimeSeries
 * (subtotal - discount - refunded), and a test asserts the channels sum to
 * the period's net revenue, so this cannot drift into a second definition.
 */
final class DashboardFigures
{
    /** Where an order came from. Null `source` is an order typed in by hand. */
    public const CHANNELS = ['salla', 'zid', 'file', 'manual'];

    /**
     * Sales by channel, largest first.
     *
     * `gross_margin` is only present when cost may be shown, and is null on a
     * channel whose revenue is zero or negative (a ratio over nothing).
     *
     * @return array{rows: list<array<string, mixed>>, total: string}
     */
    public function channels(Period $period, bool $withCost): array
    {
        [$from, $to] = $period->utcBounds();
        $scale = Money::scale();

        $rows = TenantQuery::table('orders')
            ->whereIn('status', OrderStatus::qualifying())
            ->where('placed_at', '>=', $from)
            ->where('placed_at', '<', $to)
            ->selectRaw("COALESCE(source, 'manual') AS channel")
            ->selectRaw('COUNT(*) AS orders')
            ->selectRaw('COALESCE(SUM(subtotal_amount - discount_amount - refunded_amount), 0) AS revenue')
            ->selectRaw('COALESCE(SUM(subtotal_amount - discount_amount - refunded_amount - cogs_amount), 0) AS profit')
            ->selectRaw('MAX(placed_at) AS last_order_at')
            ->groupBy('channel')
            ->get();

        $total = Money::zero();

        foreach ($rows as $row) {
            $total = bcadd($total, (string) $row->revenue, $scale);
        }

        $out = [];

        foreach ($rows as $row) {
            $revenue = Money::round((string) $row->revenue);
            $entry = [
                'key' => (string) $row->channel,
                'orders' => (int) $row->orders,
                'revenue' => $revenue,
                'share' => $this->ratio($revenue, $total),
                'last_order_at' => $row->last_order_at !== null
                    ? Carbon::parse((string) $row->last_order_at, 'UTC')->toIso8601String()
                    : null,
            ];

            if ($withCost) {
                $entry['gross_margin'] = bccomp($revenue, '0', $scale) > 0
                    ? $this->ratio(Money::round((string) $row->profit), $revenue)
                    : null;
            }

            $out[] = $entry;
        }

        usort($out, static fn (array $a, array $b): int => bccomp($b['revenue'], $a['revenue'], $scale));

        return ['rows' => $out, 'total' => $total];
    }

    /**
     * Operating expenses by category: the largest `$limit`, then one "other"
     * row so the rows always add up to the whole.
     *
     * @param  array<string, string>  $byCategory  name => amount
     * @return array{rows: list<array<string, mixed>>, total: string}
     */
    public function expensesByCategory(array $byCategory, int $limit = 3): array
    {
        $scale = Money::scale();
        uasort($byCategory, static fn (string $a, string $b): int => bccomp($b, $a, $scale));

        $total = array_reduce($byCategory, static fn (string $c, string $v): string => bcadd($c, $v, $scale), Money::zero());
        $rows = [];
        $other = Money::zero();
        $otherCount = 0;
        $i = 0;

        foreach ($byCategory as $name => $amount) {
            if ($i++ < $limit) {
                $rows[] = ['label' => (string) $name, 'value' => Money::round($amount), 'share' => $this->ratio($amount, $total), 'is_other' => false];

                continue;
            }

            $other = bcadd($other, $amount, $scale);
            $otherCount++;
        }

        if ($otherCount > 0) {
            $rows[] = ['label' => null, 'count' => $otherCount, 'value' => Money::round($other), 'share' => $this->ratio($other, $total), 'is_other' => true];
        }

        return ['rows' => $rows, 'total' => Money::round($total)];
    }

    /**
     * Net profit per bucket: gross profit minus operating expenses, the same
     * subtraction MetricCalculator::netProfit() makes for the whole period.
     *
     * @param  list<array<string, mixed>>  $grossProfit
     * @param  list<array<string, mixed>>  $expenses
     * @return list<array<string, mixed>>
     */
    public function netProfitTrend(array $grossProfit, array $expenses): array
    {
        $scale = Money::scale();
        $spent = [];

        foreach ($expenses as $point) {
            $spent[$point['bucket']] = (string) $point['value'];
        }

        return array_map(static function (array $point) use ($spent, $scale): array {
            $point['value'] = bcsub((string) $point['value'], $spent[$point['bucket']] ?? '0', $scale);

            return $point;
        }, $grossProfit);
    }

    /**
     * The bucket with the most revenue, or null when nothing was sold.
     *
     * @param  list<array<string, mixed>>  $revenue
     * @return array<string, mixed>|null
     */
    public function peak(array $revenue): ?array
    {
        $scale = Money::scale();
        $best = null;

        foreach ($revenue as $point) {
            if (bccomp((string) $point['value'], '0', $scale) <= 0) {
                continue;
            }

            if ($best === null || bccomp((string) $point['value'], (string) $best['value'], $scale) > 0) {
                $best = $point;
            }
        }

        return $best === null ? null : [
            'bucket' => $best['bucket'],
            'bucket_end' => $best['bucket_end'],
            'value' => (string) $best['value'],
        ];
    }

    /** Net revenue over the days of the period. */
    public function dailyAverage(string $netRevenue, Period $period): string
    {
        $days = max(1, $period->lengthInDays());

        return Money::round(bcdiv($netRevenue, (string) $days, Money::scale() + 2));
    }

    /** Null on a zero base: a share of nothing is undefined, not zero. */
    private function ratio(string $part, string $whole): ?float
    {
        if (bccomp($whole, '0', Money::scale()) === 0) {
            return null;
        }

        return round((float) bcdiv($part, $whole, 10), 6);
    }
}
