'use client';

import Link from 'next/link';

import { useDashboard } from '@/features/analytics/useAnalytics';
import { MetricTile } from '@/features/analytics/MetricTile';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge, PartialBadge } from '@/components/ui/Badge';
import { StatGrid } from '@/components/data/StatTile';
import { ErrorState } from '@/components/data/States';
import { BreakdownChart } from '@/components/charts/BreakdownChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/layout/PeriodSelector';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatNumber } from '@/lib/format';

const PERIOD_CONFIG = {
  defaults: { preset: '30d', comparison: 'previous_period' },
  allowed: ['preset', 'from', 'to', 'comparison'],
  sortable: [],
};

/*
 * The order tiles appear in, and which are cost-bearing.
 *
 * The dashboard endpoint returns a DIFFERENT SET OF KEYS per role — cost tiles
 * are absent, not null, for a cost-blind role. This list is filtered against
 * what actually arrived rather than assuming a fixed shape
 * (ROLES_AND_PERMISSIONS.md §4).
 */
const TILE_ORDER = [
  'net_revenue',
  'orders_count',
  'average_order_value',
  'new_customers',
  'gross_profit',
  'gross_margin',
  'operating_expenses',
  'net_profit',
  'cancellation_rate',
  'refund_rate',
  'units_sold',
  'returning_customers',
];

export default function DashboardPage() {
  const { user } = useAuth();
  const { filters, setFilters } = useUrlFilters(PERIOD_CONFIG);

  const period = {
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    comparison: filters.comparison,
  };

  const { dashboard, meta, isLoading, isError, error, refetch } = useDashboard(period);

  const metrics = dashboard?.metrics ?? {};
  const partial = meta?.period?.is_partial ?? false;
  const comparisonLabel = meta?.comparison?.label ?? '';
  const currency = meta?.currency ?? 'BHD';
  const decimals = meta?.currency_decimals ?? 3;

  // Only the keys the server actually sent, in the documented order.
  const visibleTiles = TILE_ORDER.filter((key) => key in metrics);

  if (isError) {
    return (
      <div>
        <PageHeader title="Dashboard" />
        <Card padded={false}>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Dashboard"
        description={`Signed in as ${user.name} · ${user.role_label}`}
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

      {/*
        An incomplete period compared against a complete one is stated outright.
        Without it, a dashboard on the 2nd of the month reads as a collapse in
        trade rather than as a month that has barely started.
      */}
      {meta?.comparison?.compares_partial_against_complete && (
        <p
          role="status"
          className="flex flex-wrap items-center gap-2 rounded-[--radius-sm] border border-[--color-warning] bg-[--color-warning-subtle] px-3 py-2 text-[0.8125rem] text-[--color-warning]"
        >
          <PartialBadge />
          This period is still in progress, so it is being compared against a complete one. Expect
          every figure to look low until it finishes.
        </p>
      )}

      <StatGrid>
        {isLoading && visibleTiles.length === 0
          ? TILE_ORDER.slice(0, 4).map((key) => <MetricTile key={key} metricKey={key} loading />)
          : visibleTiles.map((key) => (
              <MetricTile
                key={key}
                metricKey={key}
                metric={metrics[key]}
                currency={currency}
                decimals={decimals}
                comparisonLabel={comparisonLabel}
                partial={partial}
              />
            ))}
      </StatGrid>

      <div className="grid gap-4 xl:grid-cols-2">
        <TrendChart
          title="Net revenue"
          description={meta ? `${meta.period.from} to ${meta.period.to}` : undefined}
          series={dashboard?.revenue_trend ?? []}
          format="money"
          currency={currency}
          decimals={decimals}
          loading={isLoading}
        />

        {/* Absent entirely for a cost-blind role — the server never sent it. */}
        {dashboard?.profit_trend && (
          <TrendChart
            title="Gross profit"
            description="Net revenue less the cost recorded at the moment of sale"
            series={dashboard.profit_trend}
            format="money"
            currency={currency}
            decimals={decimals}
            loading={isLoading}
            colour="var(--series-3)"
          />
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <BreakdownChart
          title="Top products by revenue"
          description="Grouped by the SKU recorded at the time of sale"
          rows={dashboard?.top_products ?? []}
          format="money"
          currency={currency}
          decimals={decimals}
          loading={isLoading}
          height={260}
        />

        <LowStockCard data={dashboard?.low_stock} loading={isLoading} />
      </div>
    </div>
  );
}

/**
 * Low stock.
 *
 * A POINT-IN-TIME figure: it reflects now, not the selected period, and says so
 * — otherwise a reader takes it as "low stock during August" (METRICS.md §2.18).
 */
function LowStockCard({ data, loading }) {
  const items = data?.items ?? [];

  return (
    <Card
      title="Low stock"
      description="As of now — not for the selected period"
      actions={
        data?.count > 0 ? (
          <Badge tone="warning">{formatNumber(data.count)} below reorder point</Badge>
        ) : null
      }
    >
      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="skeleton h-4 rounded-[--radius-sm]" />
          <div className="skeleton h-4 rounded-[--radius-sm]" />
          <div className="skeleton h-4 rounded-[--radius-sm]" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-sm text-[--color-text-muted]">
          Nothing is at or below its reorder point.
        </p>
      ) : (
        <ul className="divide-y divide-[--color-line]">
          {items.map((item) => (
            <li key={item.product_id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-[--color-text]">{item.product?.name}</p>
                <p className="font-mono text-[0.6875rem] text-[--color-text-subtle]">
                  {item.product?.sku}
                </p>
              </div>
              <span className="tabular shrink-0 text-sm font-medium text-[--color-warning]">
                {formatNumber(item.stock_on_hand)} left
              </span>
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/inventory?low_stock=true"
        className="mt-3 inline-block text-[0.8125rem] text-[--color-accent-text] hover:underline"
      >
        View all inventory
      </Link>
    </Card>
  );
}
