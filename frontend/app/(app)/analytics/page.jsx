'use client';

import { useBreakdown, useSummary, useTimeseries } from '@/features/analytics/useAnalytics';
import { MetricTile } from '@/features/analytics/MetricTile';
import { useAuth } from '@/features/auth/AuthProvider';
import { PartialBadge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Field';
import { StatGrid } from '@/components/data/StatTile';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { BreakdownChart } from '@/components/charts/BreakdownChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/layout/PeriodSelector';
import { useUrlFilters } from '@/hooks/useUrlFilters';

const FILTER_CONFIG = {
  defaults: {
    preset: '90d',
    comparison: 'previous_period',
    metric: 'net_revenue',
    grain: '',
    dimension: 'product',
  },
  allowed: ['preset', 'from', 'to', 'comparison', 'metric', 'grain', 'dimension'],
  sortable: [],
};

const TILE_ORDER = [
  'net_revenue',
  'gross_revenue',
  'orders_count',
  'units_sold',
  'average_order_value',
  'gross_profit',
  'gross_margin',
  'net_profit',
  'net_margin',
  'operating_expenses',
  'cogs',
  'new_customers',
  'returning_customers',
  'cancellation_rate',
  'refund_rate',
];

export default function AnalyticsPage() {
  const { can } = useAuth();
  const { filters, setFilters } = useUrlFilters(FILTER_CONFIG);

  const period = {
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    comparison: filters.comparison,
  };

  const showCost = can('metrics.view_cost');

  const summary = useSummary(period);
  const trend = useTimeseries(period, filters.metric, filters.grain || undefined);
  const breakdown = useBreakdown(period, filters.dimension, 'net_revenue', 10);

  // A direct URL hit by a role without the ability. Navigation hides the link,
  // but a bookmark still has to be refused.
  if (summary.isError && summary.error?.isForbidden) {
    return <ForbiddenState />;
  }

  const meta = summary.meta;
  const metrics = summary.metrics ?? {};
  const currency = meta?.currency ?? 'BHD';
  const decimals = meta?.currency_decimals ?? 3;
  const visibleTiles = TILE_ORDER.filter((key) => key in metrics);

  // Cost-bearing series are refused by the API rather than returned as zeros,
  // so they are only offered to a role that may see them.
  const metricOptions = [
    { value: 'net_revenue', label: 'Net revenue' },
    { value: 'gross_revenue', label: 'Gross revenue' },
    { value: 'orders_count', label: 'Orders' },
    ...(showCost
      ? [
          { value: 'gross_profit', label: 'Gross profit' },
          { value: 'cogs', label: 'Cost of goods' },
        ]
      : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Analytics"
        description="Every figure is computed from source records at the moment you ask. Nothing here is stored."
        actions={
          <PeriodSelector
            preset={filters.preset}
            from={filters.from}
            to={filters.to}
            comparison={filters.comparison}
            onChange={(next) =>
              setFilters({
                preset: next.preset,
                from: next.preset === 'custom' ? next.from : undefined,
                to: next.preset === 'custom' ? next.to : undefined,
                comparison: next.comparison,
              })
            }
          />
        }
      />

      {meta?.comparison?.compares_partial_against_complete && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-(--radius-sm) border border-(--color-warning) bg-(--color-warning-subtle) px-3 py-2 text-[0.8125rem] text-(--color-warning)"
        >
          <PartialBadge />
          This period is still in progress and is being compared against a complete one.
        </p>
      )}

      {summary.isError ? (
        <Card padded={false}>
          <ErrorState error={summary.error} onRetry={summary.refetch} />
        </Card>
      ) : (
        <StatGrid>
          {summary.isLoading && visibleTiles.length === 0
            ? TILE_ORDER.slice(0, 4).map((key) => <MetricTile key={key} metricKey={key} loading />)
            : visibleTiles.map((key) => (
                <MetricTile
                  key={key}
                  metricKey={key}
                  metric={metrics[key]}
                  currency={currency}
                  decimals={decimals}
                  comparisonLabel={meta?.comparison?.label ?? ''}
                  partial={meta?.period?.is_partial ?? false}
                />
              ))}
        </StatGrid>
      )}

      <TrendChart
        title="Trend"
        description={
          trend.meta
            ? `${trend.meta.metric.replaceAll('_', ' ')} · ${trend.meta.grain}ly · ${trend.meta.period.from} to ${trend.meta.period.to}`
            : undefined
        }
        series={trend.series}
        format={filters.metric === 'orders_count' ? 'count' : 'money'}
        currency={currency}
        decimals={decimals}
        loading={trend.isLoading}
        error={trend.isError ? trend.error : null}
        onRetry={trend.refetch}
        height={320}
      />

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-(--color-text-muted)">
            Metric
          </span>
          <Select
            value={filters.metric}
            onChange={(event) => setFilters({ metric: event.target.value })}
            options={metricOptions}
            className="w-48"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-(--color-text-muted)">
            Grain
          </span>
          <Select
            value={filters.grain}
            onChange={(event) => setFilters({ grain: event.target.value })}
            placeholder="Automatic"
            options={[
              { value: 'day', label: 'Daily' },
              { value: 'week', label: 'Weekly' },
              { value: 'month', label: 'Monthly' },
            ]}
            className="w-40"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-(--color-text-muted)">
            Break down by
          </span>
          <Select
            value={filters.dimension}
            onChange={(event) => setFilters({ dimension: event.target.value })}
            options={[
              { value: 'product', label: 'Product' },
              { value: 'category', label: 'Category' },
              { value: 'customer', label: 'Customer' },
            ]}
            className="w-44"
          />
        </label>
      </div>

      <BreakdownChart
        title={`Net revenue by ${filters.dimension}`}
        description="Ranked, with everything outside the top ten grouped as Other"
        rows={breakdown.rows}
        format="money"
        currency={currency}
        decimals={decimals}
        loading={breakdown.isLoading}
        error={breakdown.isError ? breakdown.error : null}
        onRetry={breakdown.refetch}
        height={380}
      />

      <Card>
        <h2 className="text-sm font-semibold text-(--color-text)">How to read these figures</h2>
        <ul className="mt-2 space-y-1.5 text-[0.8125rem] leading-relaxed text-(--color-text-muted)">
          <li>
            Revenue excludes tax and shipping. Tax is collected for a tax authority; shipping is
            treated as cost recovery.
          </li>
          <li>
            Cost of goods uses the cost recorded <strong>at the moment of sale</strong>, so changing
            a product&rsquo;s cost today never moves a past figure.
          </li>
          <li>
            A refund reduces the period the order was <strong>placed</strong> in, not the period the
            refund was issued.
          </li>
          <li>
            An em dash means the figure cannot be computed — usually a division by zero. It never
            means zero.
          </li>
          <li>
            Changes between two ratios are shown in percentage <strong>points</strong> (pp), not
            percentages.
          </li>
        </ul>
      </Card>
    </div>
  );
}
