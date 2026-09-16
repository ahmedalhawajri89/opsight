<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Authorization\Ability;
use App\Domain\Orders\OrderStatus;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use InvalidArgumentException;

/**
 * A metric grouped by a dimension: product, category or customer.
 *
 * THE RULE THAT MAKES TOP-N HONEST: a truncated ranking always carries an
 * "Other" row. Without it the visible shares sum to less than the whole while
 * looking like they sum to it, and a chart of the top five implies those five
 * ARE the business (METRICS.md §3).
 *
 * Shares are computed against the FULL period total, not against the visible
 * rows, so they stay true after truncation.
 *
 * A NOTE ON THE LAYER RULE. L2 is supposed to compose from L1 rather than
 * query L0 itself, and this class does not: a per-group aggregation cannot be
 * expressed as N calls to a period-scoped metric without issuing N queries —
 * one per product, per category, per customer. So it writes its own SQL.
 *
 * That deviation is only safe because of a guard: a test asserts that the
 * buckets SUM to the figure MetricCalculator reports for the whole period. If
 * the two definitions ever drift, the sum stops matching and the test fails.
 * Without that test this would be a second definition of revenue, which is the
 * exact failure METRICS.md exists to prevent.
 */
final class Breakdown
{
    public const DIMENSIONS = ['product', 'category', 'customer'];

    /**
     * @return array<string, mixed>
     */
    public function build(
        Period $period,
        string $dimension,
        string $metric,
        ?User $user,
        int $limit = 10,
    ): array {
        if (! in_array($dimension, self::DIMENSIONS, strict: true)) {
            throw new InvalidArgumentException("Unknown breakdown dimension: {$dimension}.");
        }

        $this->assertMetricIsPermitted($metric, $user);

        $rows = $this->query($period, $dimension, $metric);
        $total = $this->totalFor($rows);

        $top = array_slice($rows, 0, $limit);
        $remainder = array_slice($rows, $limit);

        $result = array_map(
            fn (array $row): array => $this->present($row, $total),
            $top,
        );

        if ($remainder !== []) {
            $otherValue = array_reduce(
                $remainder,
                fn (string $carry, array $row): string => bcadd($carry, (string) $row['value'], 2),
                '0.00',
            );

            $result[] = [
                'key' => 'other',
                'label' => 'Other',
                // Named so the reader knows what is behind the row rather than
                // wondering how much is hidden.
                'sublabel' => count($remainder).' more',
                'value' => $otherValue,
                'share' => $this->share($otherValue, $total),
                'is_other' => true,
            ];
        }

        return [
            'rows' => $result,
            'total' => $total,
            'dimension' => $dimension,
            'metric' => $metric,
        ];
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function query(Period $period, string $dimension, string $metric): array
    {
        [$from, $to] = $period->utcBounds();

        // Line-level metrics join order_items; order-level ones do not.
        $value = match ($metric) {
            'net_revenue' => 'COALESCE(SUM(order_items.line_total), 0)',
            'units_sold' => 'COALESCE(SUM(order_items.quantity), 0)',
            'cogs' => 'COALESCE(SUM(ROUND(order_items.unit_cost * order_items.quantity, 2)), 0)',
            'gross_profit' => 'COALESCE(SUM(order_items.line_total - ROUND(order_items.unit_cost * order_items.quantity, 2)), 0)',
            default => throw new InvalidArgumentException("Unknown breakdown metric: {$metric}."),
        };

        $query = DB::table('order_items')
            ->join('orders', 'orders.id', '=', 'order_items.order_id')
            ->whereIn('orders.status', OrderStatus::qualifying())
            ->where('orders.placed_at', '>=', $from)
            ->where('orders.placed_at', '<', $to);

        $query = match ($dimension) {
            'product' => $query
                // Grouped by the SNAPSHOT sku, not by product_id: a product
                // deleted or renamed since still reports under what was sold.
                ->selectRaw("order_items.product_sku AS `key`, MAX(order_items.product_name) AS label, {$value} AS value")
                ->groupBy('order_items.product_sku'),

            'category' => $query
                ->leftJoin('products', 'products.id', '=', 'order_items.product_id')
                ->leftJoin('categories', 'categories.id', '=', 'products.category_id')
                ->selectRaw("COALESCE(categories.slug, 'uncategorised') AS `key`, COALESCE(MAX(categories.name), 'Uncategorised') AS label, {$value} AS value")
                ->groupBy('key'),

            default => $query
                ->leftJoin('customers', 'customers.id', '=', 'orders.customer_id')
                // Walk-in trade has no customer row; it is grouped as itself
                // rather than dropped, because the revenue is real.
                ->selectRaw("COALESCE(CAST(customers.id AS CHAR), 'walk-in') AS `key`, COALESCE(MAX(customers.name), 'Walk-in') AS label, {$value} AS value")
                ->groupBy('key'),
        };

        return $query
            ->orderByDesc('value')
            ->get()
            ->map(fn ($row): array => [
                'key' => (string) $row->key,
                'label' => (string) $row->label,
                'value' => (string) $row->value,
            ])
            ->all();
    }

    /**
     * @param  array<int, array<string, mixed>>  $rows
     */
    private function totalFor(array $rows): string
    {
        return array_reduce(
            $rows,
            fn (string $carry, array $row): string => bcadd($carry, (string) $row['value'], 2),
            '0.00',
        );
    }

    /**
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function present(array $row, string $total): array
    {
        return [
            'key' => $row['key'],
            'label' => $row['label'],
            'value' => $row['value'],
            'share' => $this->share((string) $row['value'], $total),
            'is_other' => false,
        ];
    }

    /** Null on a zero total — a share of nothing is not zero, it is undefined. */
    private function share(string $value, string $total): ?float
    {
        if (bccomp($total, '0', 2) === 0) {
            return null;
        }

        return round((float) bcdiv($value, $total, 10), 6);
    }

    private function assertMetricIsPermitted(string $metric, ?User $user): void
    {
        if (! in_array($metric, ['cogs', 'gross_profit'], strict: true)) {
            return;
        }

        if (! ($user?->can(Ability::MetricsViewCost->value) ?? false)) {
            abort(403, 'This metric is not available for your role.');
        }
    }
}
