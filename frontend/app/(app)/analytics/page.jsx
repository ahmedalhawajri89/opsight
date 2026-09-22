'use client';

import { useBreakdown, useSummary, useTimeseries, useVat } from '@/features/analytics/useAnalytics';
import { VatCard } from '@/features/analytics/VatCard';
import { SeasonNotice } from '@/features/analytics/SeasonNotice';
import { MetricTile } from '@/features/analytics/MetricTile';
import { useAuth } from '@/features/auth/AuthProvider';
import { Trans, useI18n } from '@/features/i18n/I18nProvider';
import { describePeriod } from '@/lib/periods';
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
                  // No per-tile "Incomplete" badge: the period is flagged once,
                  // beside the range and in the notice above. Fifteen identical
                  // badges trained the eye to skip all of them.
                />
              ))}
        </StatGrid>
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
        height={380}
      />

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
