<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Authorization\Ability;
use App\Models\User;

/**
 * The L2 summary: every headline metric for a period, with its comparison.
 *
 * Composed from MetricCalculator and nothing else — it never reaches into L0
 * with its own arithmetic. A metric has one definition project-wide, and this
 * class consumes it rather than restating it.
 *
 * COST-BLIND ROLES: the cost-bearing metrics are NOT CALCULATED AT ALL, not
 * calculated and then stripped. Absence of computation is the security boundary
 * — the value never exists in the process handling that request, so there is
 * nothing to leak through a log line, an exception payload or a future endpoint
 * that forgets to redact (METRICS.md §4, SECURITY.md §4).
 */
final class MetricSummary
{
    public function __construct(private readonly MetricCalculator $metrics) {}

    /**
     * @return array<string, MetricValue>
     */
    public function for(Period $period, Comparison $comparison, ?User $user): array
    {
        $previous = $period->comparison($comparison->value);

        $values = [
            'net_revenue' => MetricValue::make(
                key: 'net_revenue',
                value: $this->metrics->netRevenue($period),
                previous: $previous ? $this->metrics->netRevenue($previous) : null,
                favourable: 'up',
                format: 'money',
            ),
            'gross_revenue' => MetricValue::make(
                key: 'gross_revenue',
                value: $this->metrics->grossRevenue($period),
                previous: $previous ? $this->metrics->grossRevenue($previous) : null,
                favourable: 'up',
                format: 'money',
            ),
            'orders_count' => MetricValue::make(
                key: 'orders_count',
                value: $this->metrics->ordersCount($period),
                previous: $previous ? $this->metrics->ordersCount($previous) : null,
                favourable: 'up',
                format: 'count',
            ),
            'units_sold' => MetricValue::make(
                key: 'units_sold',
                value: $this->metrics->unitsSold($period),
                previous: $previous ? $this->metrics->unitsSold($previous) : null,
                favourable: 'up',
                format: 'count',
            ),
            'average_order_value' => MetricValue::make(
                key: 'average_order_value',
                value: $this->metrics->averageOrderValue($period),
                previous: $previous ? $this->metrics->averageOrderValue($previous) : null,
                favourable: 'up',
                format: 'money',
                emptyReason: 'No orders in this period, so there is no average to compute.',
            ),
            'new_customers' => MetricValue::make(
                key: 'new_customers',
                value: $this->metrics->newCustomers($period),
                previous: $previous ? $this->metrics->newCustomers($previous) : null,
                favourable: 'up',
                format: 'count',
            ),
            'returning_customers' => MetricValue::make(
                key: 'returning_customers',
                value: $this->metrics->returningCustomers($period),
                previous: $previous ? $this->metrics->returningCustomers($previous) : null,
                favourable: 'up',
                format: 'count',
            ),

            /*
             * Down is good for both of these.
             *
             * Colouring by the sign of the change would paint a rising
             * cancellation rate green — a real reporting error, and the reason
             * every metric declares its favourable direction rather than
             * letting the UI infer one.
             */
            'cancellation_rate' => MetricValue::make(
                key: 'cancellation_rate',
                value: $this->metrics->cancellationRate($period),
                previous: $previous ? $this->metrics->cancellationRate($previous) : null,
                favourable: 'down',
                format: 'ratio',
                emptyReason: 'No orders were placed in this period.',
            ),
            'refund_rate' => MetricValue::make(
                key: 'refund_rate',
                value: $this->metrics->refundRate($period),
                previous: $previous ? $this->metrics->refundRate($previous) : null,
                favourable: 'down',
                format: 'ratio',
                emptyReason: 'No revenue in this period to refund against.',
            ),
        ];

        if ($this->canSeeCost($user)) {
            $values += $this->costMetrics($period, $previous);
        }

        return $values;
    }

    /**
     * Cost, profit and margin.
     *
     * Only ever called for a user who holds metrics.view_cost. For anyone else
     * these lines never run, so the figures are never computed.
     *
     * @return array<string, MetricValue>
     */
    private function costMetrics(Period $period, ?Period $previous): array
    {
        return [
            'cogs' => MetricValue::make(
                key: 'cogs',
                value: $this->metrics->cogs($period),
                previous: $previous ? $this->metrics->cogs($previous) : null,
                // Rising cost of goods is bad news even though the number grew.
                favourable: 'down',
                format: 'money',
            ),
            'gross_profit' => MetricValue::make(
                key: 'gross_profit',
                value: $this->metrics->grossProfit($period),
                previous: $previous ? $this->metrics->grossProfit($previous) : null,
                favourable: 'up',
                format: 'money',
            ),
            'gross_margin' => MetricValue::make(
                key: 'gross_margin',
                value: $this->metrics->grossMargin($period),
                previous: $previous ? $this->metrics->grossMargin($previous) : null,
                favourable: 'up',
                format: 'ratio',
                emptyReason: 'No net revenue in this period, so there is no margin.',
            ),
            'operating_expenses' => MetricValue::make(
                key: 'operating_expenses',
                value: $this->metrics->operatingExpenses($period),
                previous: $previous ? $this->metrics->operatingExpenses($previous) : null,
                favourable: 'down',
                format: 'money',
            ),
            'net_profit' => MetricValue::make(
                key: 'net_profit',
                value: $this->metrics->netProfit($period),
                previous: $previous ? $this->metrics->netProfit($previous) : null,
                favourable: 'up',
                format: 'money',
            ),
            'net_margin' => MetricValue::make(
                key: 'net_margin',
                value: $this->metrics->netMargin($period),
                previous: $previous ? $this->metrics->netMargin($previous) : null,
                favourable: 'up',
                format: 'ratio',
                emptyReason: 'No net revenue in this period, so there is no margin.',
            ),
        ];
    }

    public function canSeeCost(?User $user): bool
    {
        return $user?->can(Ability::MetricsViewCost->value) ?? false;
    }
}
