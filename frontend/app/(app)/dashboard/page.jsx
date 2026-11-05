'use client';

import dynamic from 'next/dynamic';

import { getMoneyDefaults } from '@/lib/format';
import { useDashboard } from '@/features/analytics/useAnalytics';
import {
  InventoryStatusCard,
  PeriodStatus,
  RecentActivityCard,
  TopSellingCard,
} from '@/features/analytics/DashboardPanels';
import { useAuth } from '@/features/auth/AuthProvider';
import { AttentionStrip } from '@/features/dashboard/AttentionStrip';
import { DashboardHero } from '@/features/dashboard/DashboardHero';
import { DashboardTabs } from '@/features/dashboard/DashboardTabs';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useInsights } from '@/features/insights/useInsights';
import { RecentOrdersCard } from '@/features/orders/RecentOrdersCard';
import { ErrorState } from '@/components/data/States';

import { TopBarPortal } from '@/components/layout/AppShell';
import { Card } from '@/components/layout/PageHeader';
import { PeriodControls } from '@/components/layout/PeriodControls';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { EmptyPeriodNotice } from '@/features/analytics/EmptyPeriodNotice';
import { SeasonNotice } from '@/features/analytics/SeasonNotice';
import { resolvePreset } from '@/lib/periods';

/*
 * The charts arrive on their own.
 *
 * Recharts is about 114KB gzipped and only two screens draw with it — but one
 * of them is this, where every session lands. Loading it on demand lets the
 * figures, which are the point, paint without waiting for the library that
 * draws their history. `ssr: false` because it measures the DOM it is in.
 */
const CategoryShareChart = dynamic(
  () =>
    import('@/components/charts/CategoryShareChart').then((module) => module.CategoryShareChart),
  { ssr: false },
);
const RevenueExpensesChart = dynamic(
  () =>
    import('@/components/charts/RevenueExpensesChart').then(
      (module) => module.RevenueExpensesChart,
    ),
  { ssr: false },
);

const PERIOD_CONFIG = {
  defaults: { preset: '30d', comparison: 'previous_period' },
  allowed: ['preset', 'from', 'to', 'comparison'],
  sortable: [],
};

/**
 * The dashboard: a page for the first minute of the day.
 *
 * IT USED TO SHOW EVERYTHING, AND SO IT SAID NOTHING. Twelve figures, four
 * charts, two tables, a feed, stock, activity and quick stats, all at the
 * same weight: a reader who opened it with one question met fifteen answers
 * and no way in. It is four bands now, in the order a person asks:
 *
 *   1  HOW IS IT GOING?        three figures on the band of ink (DashboardHero)
 *   2  WHAT NEEDS ME?          the insights, as things to do (AttentionStrip)
 *   3  WHAT SHAPE WAS IT?      revenue against expenses, and sales by category
 *   4  WHAT HAPPENED?          orders, best sellers, stock and activity, as tabs
 *
 * The rest moved, nothing was lost: the eight supporting figures are among
 * the fifteen on Analytics, and business performance and quick stats sit at
 * the foot of that screen.
 *
 * Every figure comes from the dashboard endpoint, the insights endpoint, or an
 * ordinary list endpoint. This page computes nothing: the server owns every
 * number, and the page owns only where it goes.
 *
 * WHAT A ROLE CANNOT SEE IS ABSENT, NOT EMPTY. The band takes its three
 * figures from what the server sent; a tab for a refused list is not offered;
 * the quick actions are only those the role may take.
 */
/** Is this calendar day inside the period the server resolved? */
function withinPeriod(day, period) {
  if (!period?.from || !period?.to) return false;

  return day >= period.from && day <= period.to;
}

/** The whole calendar month containing a day, as a custom range. */
function monthAround(day) {
  const date = new Date(`${day}T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth();
  const pad = (value) => String(value).padStart(2, '0');
  const last = new Date(year, month + 1, 0).getDate();

  return {
    from: `${year}-${pad(month + 1)}-01`,
    to: `${year}-${pad(month + 1)}-${pad(last)}`,
  };
}

export default function DashboardPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const { filters, setFilters } = useUrlFilters(PERIOD_CONFIG);
  // From 1440px the rail stands beside the content and the period controls
  // live in the top bar; below that both move into the page.
  const wide = useMediaQuery('(min-width: 90rem)');

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
  const currency = meta?.currency ?? getMoneyDefaults().currency;
  const decimals = meta?.currency_decimals ?? getMoneyDefaults().decimals;

  /*
   * An empty window that is not an empty business.
   *
   * "Nothing happened" and "nothing happened HERE" render identically — a
   * column of zeros — and mean opposite things. The notice appears only when
   * both are true: this period produced no trade, and the server says the
   * business traded on some other day.
   *
   * Orders, not revenue, decides it: a period CAN legitimately contain
   * orders worth nothing once discounts and refunds are counted, and that
   * is trade, not silence.
   */
  const periodIsEmpty = Number(metrics.orders_count?.value ?? 0) === 0;
  const latestActivityOn = meta?.latest_activity_on ?? null;
  const tradedElsewhere =
    periodIsEmpty && latestActivityOn !== null && !withinPeriod(latestActivityOn, meta?.period);
  const money = { currency, decimals };
  const firstLoad = isLoading && !dashboard;

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
   * a wide screen, beneath the band otherwise.
   */
  const notices = (
    <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 empty:hidden">
      {/*
        Shown whenever the selected range includes today. The sentence beside
        it says what that means: compared against a complete period, or simply
        still accumulating when there is no comparison.
      */}
      <PeriodStatus
        show={meta?.period?.is_partial}
        againstComplete={meta?.comparison?.compares_partial_against_complete}
      />

      {/* Ramadan or Eid on one side of the comparison and not the other. */}
      <SeasonNotice meta={meta} onUseHijri={(comparison) => setFilters({ comparison })} />

      {!wide && controls}
    </div>
  );

  const hero = (
    <>
      {wide && <TopBarPortal>{controls}</TopBarPortal>}

      <DashboardHero
        metrics={metrics}
        revenueTrend={dashboard?.revenue_trend}
        currency={currency}
        decimals={decimals}
        comparisonLabel={comparisonLabel}
        loading={firstLoad}
      />

      {notices}
    </>
  );

  if (isError) {
    return (
      <div className="space-y-6">
        {hero}
        <Card padded={false}>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  /*
   * The lists, one at a time. Orders and activity are offered only to roles
   * that may open them; the best sellers and stock are on every dashboard.
   */
  const tabs = [
    can('orders.view') && {
      id: 'orders',
      label: t('dashboard.tabs.orders'),
      icon: 'orders',
      render: () => <RecentOrdersCard {...money} />,
    },
    {
      id: 'products',
      label: t('dashboard.tabs.products'),
      icon: 'star',
      render: () => (
        <TopSellingCard rows={dashboard?.top_products ?? []} {...money} loading={isLoading} />
      ),
    },
    {
      id: 'inventory',
      label: t('dashboard.tabs.inventory'),
      icon: 'shelves',
      render: () => (
        <InventoryStatusCard
          status={dashboard?.inventory_status}
          lowStock={dashboard?.low_stock}
          loading={isLoading}
        />
      ),
    },
    can('activity.view') && {
      id: 'activity',
      label: t('dashboard.tabs.activity'),
      icon: 'activity',
      render: () => <RecentActivityCard />,
    },
  ].filter(Boolean);

  return (
    <div className="space-y-8">
      <div className="space-y-4">{hero}</div>

      {tradedElsewhere && (
        <EmptyPeriodNotice
          latestActivityOn={latestActivityOn}
          onJump={() =>
            changePeriod({
              preset: 'custom',
              ...monthAround(latestActivityOn),
              comparison: filters.comparison,
            })
          }
        />
      )}

      {/*
        Insights read the same period as the figures, so the cards and the
        band cannot describe different windows.
      */}
      <AttentionStrip
        insights={insights.insights}
        suppressed={insights.suppressed}
        loading={insights.isLoading}
        viewAllHref={can('analytics.view') ? '/analytics' : undefined}
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
          weekendDays={meta?.weekend_days}
          className="rise lg:col-span-7"
          style={{ '--rise-index': 4 }}
        />

        <CategoryShareChart
          rows={dashboard?.category_breakdown ?? []}
          total={metrics.net_revenue?.value ?? null}
          {...money}
          loading={isLoading}
          className="rise lg:col-span-5"
          style={{ '--rise-index': 5 }}
        />
      </div>

      <DashboardTabs tabs={tabs} label={t('dashboard.tabs.label')} />
    </div>
  );
}
