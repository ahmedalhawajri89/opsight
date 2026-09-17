'use client';

import { useDashboard } from '@/features/analytics/useAnalytics';
import { KpiPanel } from '@/features/analytics/KpiPanel';
import {
  ExploreAnalyticsCard,
  InventoryStatusCard,
  PeriodStatus,
  QuickStatsCard,
  RecentActivityCard,
  TopSellingCard,
} from '@/features/analytics/DashboardPanels';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { InsightFeed } from '@/features/insights/InsightFeed';
import { useInsights } from '@/features/insights/useInsights';
import { RecentOrdersCard } from '@/features/orders/RecentOrdersCard';
import { ErrorState } from '@/components/data/States';
import { CashFlowChart } from '@/components/charts/CashFlowChart';
import { CategoryShareChart } from '@/components/charts/CategoryShareChart';
import { RevenueExpensesChart } from '@/components/charts/RevenueExpensesChart';
import { TopBarPortal } from '@/components/layout/AppShell';
import { Card } from '@/components/layout/PageHeader';
import { PeriodControls } from '@/components/layout/PeriodControls';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { cn } from '@/lib/cn';
import { resolvePreset } from '@/lib/periods';

const PERIOD_CONFIG = {
  defaults: { preset: '30d', comparison: 'previous_period' },
  allowed: ['preset', 'from', 'to', 'comparison'],
  sortable: [],
};

/**
 * The dashboard.
 *
 * Laid out as a main column and a side rail:
 *
 *   MAIN   the four headline cards and eight supporting ones; revenue and
 *          expenses over the period beside sales by category; the best-selling
 *          products beside the latest orders; then business performance, quick
 *          stats and recent activity
 *   RAIL   key insights, inventory status, and the way into Analytics
 *
 * Every figure comes from the dashboard endpoint, the insights endpoint, or an
 * ordinary list endpoint. This page computes nothing: the server owns every
 * number, and the page owns only where it goes.
 *
 * WHAT A ROLE CANNOT SEE IS ABSENT, NOT EMPTY. Cost panels, the audit trail and
 * the Analytics entry point render only for roles that have them, and each row
 * closes up around what is missing rather than leaving a hole.
 */
export default function DashboardPage() {
  const { user, can } = useAuth();
  const { t } = useI18n();
  const { filters, setFilters } = useUrlFilters(PERIOD_CONFIG);
  const wide = useMediaQuery('(min-width: 1280px)');

  const period = {
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    comparison: filters.comparison,
  };

  const { dashboard, meta, isLoading, isError, error, refetch } = useDashboard(period);

  /*
   * Insights read the same period as the cards, so the feed and the figures
   * cannot describe different windows.
   */
  const insights = useInsights(period);

  const metrics = dashboard?.metrics ?? {};
  const comparisonLabel = meta?.comparison?.label ?? '';
  const currency = meta?.currency ?? 'BHD';
  const decimals = meta?.currency_decimals ?? 3;
  const money = { currency, decimals };
  const firstLoad = isLoading && !dashboard;

  const trends = {
    net_revenue: dashboard?.revenue_trend,
    orders_count: dashboard?.orders_trend,
    gross_profit: dashboard?.profit_trend,
    gross_margin: dashboard?.margin_trend,
    average_order_value: dashboard?.aov_trend,
  };

  function changePeriod(next) {
    setFilters({
      preset: next.preset,
      from: next.preset === 'custom' ? next.from : undefined,
      to: next.preset === 'custom' ? next.to : undefined,
      comparison: next.comparison,
    });
  }

  const controls = (
    <PeriodControls
      preset={filters.preset}
      from={filters.from}
      to={filters.to}
      comparison={filters.comparison}
      comparisonLabel={comparisonLabel}
      resolvedPeriod={meta?.period}
      onChange={changePeriod}
    />
  );

  /*
   * One set of period controls, rendered in exactly one place: the top bar on
   * a wide screen, beneath the greeting otherwise.
   */
  const header = (
    <>
      {wide && <TopBarPortal>{controls}</TopBarPortal>}

      <header className="rise flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {/*
            The greeting is the visible title; the page's name leads the heading
            for assistive technology, so a screen reader announces "Dashboard"
            first.
          */}
          <h1 className="text-[1.375rem] leading-tight font-semibold tracking-tight text-(--color-text)">
            <span className="sr-only">{t('nav.items.dashboard')} — </span>
            {greeting(t, user?.name)}{' '}
            <span
              aria-hidden="true"
              className="inline-block origin-[70%_70%] motion-safe:animate-[opsight-wave_1.6s_ease-in-out_400ms_1]"
            >
              👋
            </span>
          </h1>
          <p className="mt-1 text-sm text-(--color-text-muted)">{t('dashboard.subtitle')}</p>
        </div>

        {/*
          Shown whenever the selected range includes today. The sentence
          beside it says what that means: compared against a complete period,
          or simply still accumulating when there is no comparison.
        */}
        <PeriodStatus
          show={meta?.period?.is_partial}
          againstComplete={meta?.comparison?.compares_partial_against_complete}
        />
      </header>

      {!wide && <div className="rise">{controls}</div>}
    </>
  );

  if (isError) {
    return (
      <div className="space-y-6">
        {header}
        <Card padded={false}>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  const hasCost = Boolean(dashboard?.cash_flow);
  const lowerRow = [hasCost && 'performance', 'stats', can('activity.view') && 'activity'].filter(
    Boolean,
  );

  // Even thirds, closing up when a panel is absent.
  const lowerSpans = {
    3: { performance: 'xl:col-span-4', stats: 'xl:col-span-4', activity: 'xl:col-span-4' },
    2: { performance: 'xl:col-span-7', stats: 'xl:col-span-5', activity: 'xl:col-span-7' },
    1: { stats: 'md:col-span-2 xl:col-span-12' },
  }[lowerRow.length];

  return (
    <div className="space-y-5">
      {header}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_17.5rem] min-[1600px]:grid-cols-[minmax(0,1fr)_19.5rem]">
        <div className="min-w-0 space-y-4">
          <KpiPanel
            metrics={metrics}
            trends={trends}
            currency={currency}
            decimals={decimals}
            comparisonLabel={comparisonLabel}
            loading={firstLoad}
          />

          <div className="grid gap-4 lg:grid-cols-12">
            <RevenueExpensesChart
              revenue={dashboard?.revenue_trend ?? []}
              expenses={dashboard?.expenses_trend}
              {...money}
              preset={filters.preset}
              onPresetChange={(preset) =>
                changePeriod({ preset, ...resolvePreset(preset), comparison: filters.comparison })
              }
              loading={isLoading}
              className="rise lg:col-span-7"
              style={{ '--rise-index': 12 }}
            />

            <CategoryShareChart
              rows={dashboard?.category_breakdown ?? []}
              total={metrics.net_revenue?.value ?? null}
              {...money}
              loading={isLoading}
              className="rise lg:col-span-5"
              style={{ '--rise-index': 13 }}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TopSellingCard
              rows={dashboard?.top_products ?? []}
              {...money}
              loading={isLoading}
              className={cn('rise', !can('orders.view') && 'lg:col-span-2')}
              style={{ '--rise-index': 14 }}
            />

            {can('orders.view') && (
              <RecentOrdersCard {...money} className="rise" style={{ '--rise-index': 15 }} />
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-12">
            {hasCost && (
              <CashFlowChart
                data={dashboard.cash_flow}
                {...money}
                loading={isLoading}
                className={cn('rise', lowerSpans.performance)}
                style={{ '--rise-index': 16 }}
              />
            )}

            <QuickStatsCard
              stats={dashboard?.quick_stats}
              currency={currency}
              loading={isLoading}
              className={cn('rise', lowerSpans.stats)}
              style={{ '--rise-index': 17 }}
            />

            {can('activity.view') && (
              <RecentActivityCard
                className={cn(
                  'rise',
                  lowerRow.length === 3 && 'md:col-span-2',
                  lowerSpans.activity,
                )}
                style={{ '--rise-index': 18 }}
              />
            )}
          </div>
        </div>

        <aside aria-label={t('dashboard.sideColumn')} className="min-w-0 space-y-5">
          <InsightFeed
            insights={insights.insights}
            suppressed={insights.suppressed}
            loading={insights.isLoading}
            viewAllHref={can('analytics.view') ? '/analytics' : undefined}
            className="rise"
            style={{ '--rise-index': 4 }}
          />

          <InventoryStatusCard
            status={dashboard?.inventory_status}
            loading={isLoading}
            className="rise"
            style={{ '--rise-index': 8 }}
          />

          {can('analytics.view') && (
            <ExploreAnalyticsCard className="rise" style={{ '--rise-index': 12 }} />
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * "Good morning, Ahmed" — by the reader's own clock, with their first name.
 *
 * The reader's local hour rather than the business timezone: a greeting is
 * about the person reading, and "good evening" at their breakfast is wrong
 * whatever the business's books say.
 */
function greeting(t, name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const first = String(name ?? '')
    .trim()
    .split(/\s+/)[0];

  return first
    ? t(`dashboard.greeting.${part}`, { name: first })
    : t(`dashboard.greeting.${part}Anonymous`);
}
