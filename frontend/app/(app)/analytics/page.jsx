'use client';

import dynamic from 'next/dynamic';

import { getMoneyDefaults } from '@/lib/format';
import {
  useBreakdown,
  useDashboard,
  useSummary,
  useTimeseries,
  useVat,
} from '@/features/analytics/useAnalytics';
import { QuickStatsCard } from '@/features/analytics/DashboardPanels';
import { VatCard } from '@/features/analytics/VatCard';
import { SeasonNotice } from '@/features/analytics/SeasonNotice';
import { KpiPanel } from '@/features/analytics/KpiPanel';
import { WaterfallChart } from '@/components/charts/WaterfallChart';
import { useAuth } from '@/features/auth/AuthProvider';
import { Trans, useI18n } from '@/features/i18n/I18nProvider';
import { describePeriod } from '@/lib/periods';
import { PartialBadge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Field';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { BreakdownChart } from '@/components/charts/BreakdownChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/layout/PeriodSelector';
import { useUrlFilters } from '@/hooks/useUrlFilters';

/*
 * Business performance came here from the dashboard (with quick stats), when
 * the dashboard became a page for the first minute of the day. Loaded on
 * demand for the same reason it was there: Recharts measures the DOM.
 */
const CashFlowChart = dynamic(
  () => import('@/components/charts/CashFlowChart').then((module) => module.CashFlowChart),
  { ssr: false },
);

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

/*
 * The compact row, in reading order: revenue and volume, then profit and
 * margin, then what it cost, then the customers behind it, then the two
 * quality rates.
 *
 * The four HEADLINE figures are not listed here — KpiPanel decides those,
 * and they are the same four on the dashboard. This is only the remainder,
 * which differs between the two screens: gross revenue, net margin and cost
 * of goods are shown here and not there.
 */
/*
 * The five steps of the period's profit, in the order the arithmetic runs.
 *
 * `total` stands on the axis; `down` is taken off the running figure. The
 * two totals are the server's own gross_profit and net_profit rather than
 * sums of the bars, so the chart can never disagree with the tile above it.
 */
const WATERFALL_STEPS = [
  { key: 'net_revenue', kind: 'total' },
  { key: 'cogs', kind: 'down' },
  { key: 'gross_profit', kind: 'total' },
  { key: 'operating_expenses', kind: 'down' },
  { key: 'net_profit', kind: 'total' },
];

const COMPACT_ORDER = [
  'gross_revenue',
  'units_sold',
  'average_order_value',
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
  const { t } = useI18n();
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
  const vat = useVat(period);
  // Monthly performance and the standing counts: the dashboard endpoint's.
  const overview = useDashboard(period);

  // A direct URL hit by a role without the ability. Navigation hides the link,
  // but a bookmark still has to be refused.
  if (summary.isError && summary.error?.isForbidden) {
    return <ForbiddenState />;
  }

  const meta = summary.meta;
  const metrics = summary.metrics ?? {};
  const currency = meta?.currency ?? getMoneyDefaults().currency;
  const decimals = meta?.currency_decimals ?? getMoneyDefaults().decimals;
  /*
   * Loading means the FIRST load, not a refetch: `placeholderData` keeps the
   * previous period's figures on screen while the next one arrives, so a
   * reader changing the range never watches the panel empty itself.
   */
  const hasFigures = Object.keys(metrics).length > 0;

  // Cost-bearing series are refused by the API rather than returned as zeros,
  // so they are only offered to a role that may see them.
  const metricOptions = [
    'net_revenue',
    'gross_revenue',
    'orders_count',
    ...(showCost ? ['gross_profit', 'cogs'] : []),
  ].map((value) => ({ value, label: t(`metrics.${value}.label`) }));

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('nav.items.analytics')}
        description={t('analytics.description')}
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
          className="flex flex-wrap items-center gap-2.5 rounded-(--radius-card) border border-(--color-warning-soft) bg-(--color-warning-soft)/60 px-4 py-2.5 text-sm text-(--color-text-2)"
        >
          <PartialBadge />
          {t('analytics.partial')}
        </p>
      )}

      {/* Ramadan or Eid on one side of the comparison and not the other. */}
      <SeasonNotice meta={meta} onUseHijri={(comparison) => setFilters({ comparison })} />

      {summary.isError ? (
        <Card padded={false}>
          <ErrorState error={summary.error} onRetry={summary.refetch} />
        </Card>
      ) : (
        /*
          TWO TIERS, which is the same arrangement the dashboard leads with
          and the arrangement §5 asks for: "A group of figures that describe
          one period is ONE panel divided by hairlines… Twelve equal boxes
          give the eye no place to start." This screen had fifteen, each in
          its own frame, and nothing said where to begin.

          Four headline figures carry an icon, a change chip and the period's
          shape; the other eleven sit in one ruled band beneath them. The
          component was already built for the dashboard and was not being
          used by anything (KpiPanel) — its compact list takes an override
          here because this screen shows three metrics the dashboard does
          not, and the default list would have dropped them without a word.

          No `trends`: this screen holds one series at a time, for the metric
          chosen under the chart below, not one per card. KpiPanel treats a
          missing series as an empty one — the sparkline is omitted and the
          card does not offer to expand.
        */
        <KpiPanel
          metrics={metrics}
          currency={currency}
          decimals={decimals}
          comparisonLabel={meta?.comparison?.label ?? ''}
          compact={COMPACT_ORDER}
          loading={summary.isLoading && !hasFigures}
        />
      )}

      {/*
        The arithmetic between the figures above, which the panel states but
        never performs. Every step is a metric the server already computed
        and this page already holds — no request, and no second idea of what
        gross profit means.

        Owner and manager only. The whole chart IS the cost structure, so
        there is no partial version of it worth drawing for a role that
        cannot see cost; `showCost` already gates the cost series in the
        metric picker below.
      */}
      {showCost && (
        <WaterfallChart
          title={t('analytics.waterfall.title')}
          description={t('analytics.waterfall.description')}
          steps={WATERFALL_STEPS.filter((step) => step.key in metrics).map((step) => ({
            ...step,
            label: t(`metrics.${step.key}.label`),
            value: metrics[step.key]?.value ?? null,
          }))}
          currency={currency}
          decimals={decimals}
          loading={summary.isLoading && !hasFigures}
          error={summary.isError ? summary.error : null}
          onRetry={summary.refetch}
        />
      )}

      <TrendChart
        title={t('analytics.trend')}
        description={
          /*
            Composed from translated parts rather than from the raw API values.
            The previous version built "day" + "ly" and printed "dayly", and
            showed ISO dates to the reader.
          */
          trend.meta
            ? [
                t(`metrics.${trend.meta.metric}.label`),
                t(`analytics.grains.${trend.meta.grain}`),
                describePeriod(trend.meta.period.from, trend.meta.period.to),
              ].join(' · ')
            : undefined
        }
        series={trend.series}
        weekendDays={trend.meta?.weekend_days}
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
          <span className="text-xs font-medium uppercase tracking-wide text-(--color-text-2)">
            {t('analytics.metric')}
          </span>
          <Select
            value={filters.metric}
            onChange={(event) => setFilters({ metric: event.target.value })}
            options={metricOptions}
            className="w-48"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-(--color-text-2)">
            {t('analytics.grain')}
          </span>
          <Select
            value={filters.grain}
            onChange={(event) => setFilters({ grain: event.target.value })}
            placeholder={t('analytics.automatic')}
            options={['day', 'week', 'month'].map((value) => ({
              value,
              label: t(`analytics.grains.${value}`),
            }))}
            className="w-40"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-(--color-text-2)">
            {t('analytics.breakDownBy')}
          </span>
          <Select
            value={filters.dimension}
            onChange={(event) => setFilters({ dimension: event.target.value })}
            options={['product', 'category', 'customer'].map((value) => ({
              value,
              label: t(`analytics.dimensions.${value}`),
            }))}
            className="w-44"
          />
        </label>
      </div>

      <BreakdownChart
        // A whole title per dimension, not "Net revenue by {dimension}": the
        // word order and the definite article differ by language.
        title={t(`analytics.breakdownTitles.${filters.dimension}`)}
        description={t('analytics.breakdownDescription')}
        rows={breakdown.rows}
        format="money"
        currency={currency}
        decimals={decimals}
        loading={breakdown.isLoading}
        error={breakdown.isError ? breakdown.error : null}
        onRetry={breakdown.refetch}
      />

      {/*
        The business at a glance: months of revenue against costs, and the
        standing counts. Cost-blind roles receive no cash flow, and the row
        closes up around it.
      */}
      {/*
        `xl`, not `lg`. Sharing the row from 1024px gave the stats panel
        about 215px, which left each label 57px — "Total Inventory Value"
        and "Owed by customers" came out as fragments, and the figures they
        name were the only readable part of the row. Below 1280 the two
        stack and each gets the full width.
      */}
      <div className="grid gap-4 xl:grid-cols-12">
        {overview.dashboard?.cash_flow && (
          <CashFlowChart
            data={overview.dashboard.cash_flow}
            currency={currency}
            decimals={decimals}
            loading={overview.isLoading}
            className="xl:col-span-8"
          />
        )}
        <QuickStatsCard
          stats={overview.dashboard?.quick_stats}
          currency={currency}
          loading={overview.isLoading}
          className={overview.dashboard?.cash_flow ? 'xl:col-span-4' : 'xl:col-span-12'}
        />
      </div>

      {/* Only while VAT is switched on for the business (ADR-018). */}
      <VatCard
        vat={vat.vat}
        loading={vat.isLoading}
        error={vat.isError ? vat.error : null}
        onRetry={vat.refetch}
        currency={currency}
        decimals={decimals}
      />

      <Card>
        <h2 className="text-base font-semibold text-(--color-text)">{t('analytics.help.title')}</h2>
        <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-(--color-text-2)">
          <li>{t('analytics.help.revenue')}</li>
          <li>
            <Trans k="analytics.help.cost" tags={{ strong: (text) => <strong>{text}</strong> }} />
          </li>
          <li>
            <Trans k="analytics.help.refund" tags={{ strong: (text) => <strong>{text}</strong> }} />
          </li>
          <li>{t('analytics.help.emDash')}</li>
          <li>
            <Trans k="analytics.help.points" tags={{ strong: (text) => <strong>{text}</strong> }} />
          </li>
        </ul>
      </Card>
    </div>
  );
}
