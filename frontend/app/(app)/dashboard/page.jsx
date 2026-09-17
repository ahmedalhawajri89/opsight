'use client';

import { useDashboard } from '@/features/analytics/useAnalytics';
import { KpiPanel } from '@/features/analytics/KpiPanel';
import { LowStockCard, PeriodStatus, TopProductsCard } from '@/features/analytics/DashboardPanels';
import { useAuth } from '@/features/auth/AuthProvider';
import { InsightFeed } from '@/features/insights/InsightFeed';
import { useInsights } from '@/features/insights/useInsights';
import { RecentOrdersCard } from '@/features/orders/RecentOrdersCard';
import { ErrorState } from '@/components/data/States';
import { TrendChart } from '@/components/charts/TrendChart';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/layout/PeriodSelector';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { cn } from '@/lib/cn';
import { figureDirection } from '@/lib/format';
import { describePeriod } from '@/lib/periods';

const PERIOD_CONFIG = {
  defaults: { preset: '30d', comparison: 'previous_period' },
  allowed: ['preset', 'from', 'to', 'comparison'],
  sortable: [],
};

/**
 * The dashboard.
 *
 * Read top to bottom, it answers three questions in order of how often they are
 * asked, and gives each less visual weight than the one before:
 *
 *   1. HOW ARE WE DOING?    the KPI band — four large figures, eight quiet ones
 *   2. WHY, AND WHAT MOVED?  the revenue trend beside the rule-based key changes,
 *                            then profit and the products behind it
 *   3. WHAT NEEDS DOING?     recent orders and stock at or below reorder point
 *
 * Every figure comes from the dashboard endpoint, the insights endpoint or the
 * ordinary orders list. This page computes nothing: no totals, no percentages,
 * no derived figures — the server owns every number, and the page owns only
 * where it goes.
 */
export default function DashboardPage() {
  const { can } = useAuth();
  const { filters, setFilters } = useUrlFilters(PERIOD_CONFIG);

  const period = {
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    comparison: filters.comparison,
  };

  const { dashboard, meta, isLoading, isError, error, refetch } = useDashboard(period);

  /*
   * Insights read the same period as the tiles, so the feed and the figures
   * cannot describe different windows. Cost-bearing rules are not evaluated at
   * all server-side for a cost-blind role, so nothing is filtered here — what
   * arrives is already what this reader is allowed to know.
   */
  const insights = useInsights(period);

  const metrics = dashboard?.metrics ?? {};
  const comparisonLabel = meta?.comparison?.label ?? '';
  const currency = meta?.currency ?? 'BHD';
  const decimals = meta?.currency_decimals ?? 3;
  const hasProfitTrend = Boolean(dashboard?.profit_trend);

  /*
   * The header states the resolved window and the basis in words, from the
   * SERVER's meta rather than from the selector's own idea of the preset — the
   * server is the authority on what the figures actually cover.
   */
  const range = meta ? describePeriod(meta.period.from, meta.period.to) : null;
  const context = range ? (
    <>
      {/* A date range is neutral characters too, and reorders in RTL. */}
      <bdi dir={figureDirection(range)} className="tabular">
        {range}
      </bdi>
      {comparisonLabel && ` · ${comparisonLabel}`}
    </>
  ) : (
    'Business performance for the selected period'
  );

  const header = (
    <PageHeader
      title="Dashboard"
      description={context}
      actions={
        <PeriodSelector
          preset={filters.preset}
          from={filters.from}
          to={filters.to}
          comparison={filters.comparison}
          showRange={false}
          showPartial={false}
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
  );

  if (isError) {
    return (
      <div>
        {header}
        <Card padded={false}>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  return (
    <div>
      {header}

      {/*
        An incomplete period compared against a complete one is stated
        outright, once. Without it, a dashboard on the 2nd of the month reads as
        a collapse in trade rather than as a month that has barely started.
      */}
      <PeriodStatus show={meta?.comparison?.compares_partial_against_complete} />

      <div className="space-y-6">
        {/* ---- 1. How are we doing ------------------------------------ */}
        <KpiPanel
          metrics={metrics}
          currency={currency}
          decimals={decimals}
          comparisonLabel={comparisonLabel}
          loading={isLoading && !dashboard}
        />

        {/* ---- 2. Why, and what moved --------------------------------- */}
        {/*
          Side by side from 1280px. Below that each panel takes the full width:
          at 1024px a 5-of-12 column is ~300px, which truncated product names
          and pushed figures past the card edge. When stacked, key changes come
          FIRST — on a narrow screen, what needs attention precedes the chart
          that explains it.
        */}
        <div className="grid gap-4 xl:grid-cols-12">
          <TrendChart
            title="Net revenue"
            description={`${currency} · ${meta ? describePeriod(meta.period.from, meta.period.to) : ''}`}
            series={dashboard?.revenue_trend ?? []}
            format="money"
            currency={currency}
            decimals={decimals}
            loading={isLoading}
            className="xl:col-span-8"
          />

          <InsightFeed
            insights={insights.insights}
            suppressed={insights.suppressed}
            loading={insights.isLoading}
            className="order-first xl:order-none xl:col-span-4"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-12">
          {/* Absent entirely for a cost-blind role — the server never sent it. */}
          {hasProfitTrend && (
            <TrendChart
              title="Gross profit"
              description={`${currency} · net revenue less cost of goods at the time of sale`}
              series={dashboard.profit_trend}
              format="money"
              currency={currency}
              decimals={decimals}
              loading={isLoading}
              colour="var(--series-3)"
              className="xl:col-span-7"
            />
          )}

          <TopProductsCard
            rows={dashboard?.top_products ?? []}
            currency={currency}
            decimals={decimals}
            loading={isLoading}
            className={hasProfitTrend ? 'xl:col-span-5' : 'xl:col-span-7'}
          />

          {!hasProfitTrend && (
            <LowStockCard
              data={dashboard?.low_stock}
              loading={isLoading}
              className="xl:col-span-5"
            />
          )}
        </div>

        {/* ---- 3. What needs doing ------------------------------------ */}
        <div className="grid gap-4 xl:grid-cols-12">
          {can('orders.view') && (
            <RecentOrdersCard
              currency={currency}
              decimals={decimals}
              className={cn(hasProfitTrend ? 'xl:col-span-8' : 'xl:col-span-12')}
            />
          )}

          {hasProfitTrend && (
            <LowStockCard
              data={dashboard?.low_stock}
              loading={isLoading}
              className={can('orders.view') ? 'xl:col-span-4' : 'xl:col-span-12'}
            />
          )}
        </div>
      </div>
    </div>
  );
}
