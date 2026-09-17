'use client';

import { Sparkline } from '@/components/charts/Sparkline';
import { Icon } from '@/components/ui/Icon';
import { InfoTip } from '@/components/ui/Tooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import {
  EMPTY,
  changeTone,
  figureDirection,
  formatMoneyParts,
  formatPercent,
  formatPoints,
} from '@/lib/format';
import { useI18n } from '@/features/i18n/I18nProvider';
import { metricDefinition, metricLabel, presentMetric } from './MetricTile';

/**
 * The dashboard's KPIs, in two tiers.
 *
 *   PRIMARY    four cards — icon, figure, change, basis, and the period's shape
 *   SECONDARY  eight compact cards beneath them
 *
 * The tier a metric lands in is decided here, but WHICH metrics exist is
 * decided by the server. A cost-blind role receives no cost keys at all, so each
 * tier fills from its ordered list with whatever did arrive — a Staff user sees
 * revenue, orders, average order value and units on top rather than holes
 * where profit and margin would be (ROLES_AND_PERMISSIONS.md §4).
 */
const PRIMARY_ORDER = [
  'net_revenue',
  'orders_count',
  'gross_profit',
  'gross_margin',
  'average_order_value',
  'units_sold',
];

const SECONDARY_ORDER = [
  'average_order_value',
  'new_customers',
  'operating_expenses',
  'net_profit',
  'cancellation_rate',
  'refund_rate',
  'units_sold',
  'returning_customers',
];

const PRIMARY_COUNT = 4;

/*
 * Icon and tint per metric, and the stroke of its sparkline. Tints come from
 * the semantic set so they stay inside the tested palette: green for what the
 * business earns, blue for volume, orange for money going out, red for orders
 * lost.
 */
const VISUALS = {
  net_revenue: { icon: 'coins', tint: 'green', spark: 'var(--spark-green)' },
  orders_count: { icon: 'receipt', tint: 'blue', spark: 'var(--spark-blue)' },
  gross_profit: { icon: 'wallet', tint: 'green', spark: 'var(--spark-purple)' },
  gross_margin: { icon: 'percent', tint: 'blue', spark: 'var(--spark-teal)' },
  average_order_value: { icon: 'percent', tint: 'blue', spark: 'var(--spark-purple)' },
  new_customers: { icon: 'userPlus', tint: 'blue' },
  operating_expenses: { icon: 'wallet', tint: 'orange' },
  net_profit: { icon: 'trendUp', tint: 'green' },
  cancellation_rate: { icon: 'arrowDown', tint: 'red' },
  refund_rate: { icon: 'undo', tint: 'green' },
  units_sold: { icon: 'box', tint: 'blue', spark: 'var(--spark-teal)' },
  returning_customers: { icon: 'repeat', tint: 'blue' },
};

const TINTS = {
  green: 'bg-(--color-positive-subtle) text-(--color-positive)',
  blue: 'bg-(--color-info-subtle) text-(--color-info)',
  orange: 'bg-(--color-warning-subtle) text-(--color-warning)',
  red: 'bg-(--color-negative-subtle) text-(--color-negative)',
};

/** Splits the metrics that arrived into the two tiers, with no key in both. */
export function tierMetrics(metrics = {}) {
  const primary = PRIMARY_ORDER.filter((key) => key in metrics).slice(0, PRIMARY_COUNT);
  const secondary = SECONDARY_ORDER.filter((key) => key in metrics && !primary.includes(key));

  return { primary, secondary };
}

const CARD =
  'min-w-0 rounded-(--radius-lg) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card)';

export function KpiPanel({ metrics, trends = {}, currency, decimals, comparisonLabel, loading }) {
  const { t } = useI18n();

  if (loading) {
    return (
      <section aria-busy="true">
        <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className={cn(CARD, 'p-5')}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-(--radius-md)" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              <Skeleton className="mt-5 h-7 w-40" />
              <Skeleton className="mt-3 h-4 w-44" />
              <Skeleton className="mt-4 h-8 w-full" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const { primary, secondary } = tierMetrics(metrics);
  const context = { currency, decimals, comparisonLabel };

  return (
    <section aria-labelledby="kpi-heading" className="space-y-4">
      <h2 id="kpi-heading" className="sr-only">
        {t('dashboard.keyMetrics')}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        {primary.map((key, index) => (
          <PrimaryKpi
            key={key}
            index={index}
            metricKey={key}
            metric={metrics[key]}
            trend={trends[key]}
            {...context}
          />
        ))}
      </div>

      {secondary.length > 0 && (
        <div
          className={cn(
            'grid grid-cols-2 gap-3 sm:grid-cols-4',
            // Eight to a row when there are eight; fewer fill the row instead.
            secondary.length > 4 && 'min-[90rem]:grid-cols-8',
          )}
        >
          {secondary.map((key, index) => (
            <SecondaryKpi
              key={key}
              index={index + 4}
              metricKey={key}
              metric={metrics[key]}
              {...context}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PrimaryKpi({ index, metricKey, metric, trend, currency, decimals, comparisonLabel }) {
  const { t } = useI18n();
  const label = metricLabel(t, metricKey);
  const definition = metricDefinition(t, metricKey);
  const shown = presentMetric(metric, { currency, decimals });
  const visual = VISUALS[metricKey] ?? { icon: 'analytics', tint: 'blue' };
  const series = Array.isArray(trend) ? trend.map((bucket) => bucket.value) : [];

  return (
    <div className={cn(CARD, 'rise flex flex-col p-5')} style={{ '--rise-index': index }}>
      {/*
        The label row is its own element and the heading is its direct child,
        so the card is always the heading's second ancestor — which the E2E
        suite relies on to find a card by its label.
      */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-9 shrink-0 items-center justify-center rounded-(--radius-md)',
            TINTS[visual.tint],
          )}
        >
          <Icon name={visual.icon} size={18} strokeWidth={2} />
        </span>
        <h3 className="min-w-0 truncate text-[0.8125rem] font-medium text-(--color-text)">
          {label}
        </h3>
        {definition && (
          <span className="ms-auto">
            <InfoTip label={label} content={definition} />
          </span>
        )}
      </div>

      <p
        className="tabular mt-4 truncate text-[1.5rem] leading-none font-bold tracking-tight text-(--color-text)"
        title={shown.value === null ? (metric.empty_reason ?? t('comparison.noValue')) : undefined}
      >
        {shown.value === null ? (
          <span className="text-(--color-text-subtle)">{EMPTY}</span>
        ) : (
          <bdi dir={figureDirection(shown.value)}>{shown.value}</bdi>
        )}
      </p>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1">
        <Change metric={metric} shown={shown} size="md" />
        {comparisonLabel && (
          <span className="truncate text-xs text-(--color-text-subtle)">{comparisonLabel}</span>
        )}
      </div>

      <div className="mt-auto pt-3">
        {series.filter((value) => value !== null).length > 1 ? (
          <Sparkline values={series} colour={visual.spark ?? 'var(--spark-blue)'} height={34} />
        ) : (
          <div aria-hidden="true" className="h-[34px]" />
        )}
      </div>
    </div>
  );
}

function SecondaryKpi({ index, metricKey, metric, currency, decimals }) {
  const { t } = useI18n();
  const label = metricLabel(t, metricKey);
  const definition = metricDefinition(t, metricKey);
  const shown = presentMetric(metric, { currency, decimals });
  const visual = VISUALS[metricKey] ?? { icon: 'analytics', tint: 'blue' };

  return (
    <div
      className={cn(CARD, 'rise flex flex-col px-3 py-3')}
      style={{ '--rise-index': index }}
      title={definition}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-5 shrink-0 items-center justify-center rounded-full',
            TINTS[visual.tint],
          )}
        >
          <Icon name={visual.icon} size={11} strokeWidth={2.25} />
        </span>
        {/* Two lines rather than an ellipsis: a truncated metric name is no name. */}
        <h3 className="line-clamp-2 min-h-[2.1em] min-w-0 text-[0.6875rem] leading-tight font-medium text-(--color-text-muted)">
          {label}
        </h3>
      </div>

      <CompactFigure metric={metric} shown={shown} currency={currency} decimals={decimals} />

      <div className="mt-auto pt-1.5">
        <Change metric={metric} shown={shown} size="sm" />
      </div>
    </div>
  );
}

/**
 * The change: an arrow and a figure, coloured by what it means for the business.
 *
 * The arrow shows the arithmetic direction; the colour shows whether that is
 * good — expenses rising is red even though the number grew. A ratio changes in
 * percentage points, and says so.
 */
function Change({ metric, shown, size }) {
  const { t } = useI18n();
  const change = shown.change;

  if (change === null || change === undefined) {
    return (
      <span
        className="tabular text-xs text-(--color-text-subtle)"
        title={t('comparison.unavailable')}
      >
        {EMPTY}
      </span>
    );
  }

  const tone = changeTone(change, metric.favourable);
  const magnitude =
    shown.changeFormat === 'points'
      ? formatPoints(Math.abs(change)).replace('+', '')
      : formatPercent(Math.abs(change));

  return (
    <span
      data-tone={tone}
      className={cn(
        'tabular inline-flex items-center gap-1 font-semibold',
        size === 'md' ? 'text-[0.8125rem]' : 'text-xs',
        tone === 'positive'
          ? 'text-(--color-positive)'
          : tone === 'negative'
            ? 'text-(--color-negative)'
            : 'text-(--color-text-muted)',
      )}
    >
      <Icon
        name={change > 0 ? 'arrowUp' : change < 0 ? 'arrowDown' : 'arrowRight'}
        size={size === 'md' ? 14 : 12}
        strokeWidth={2.5}
        label={change > 0 ? t('comparison.up') : change < 0 ? t('comparison.down') : undefined}
      />
      <bdi dir={figureDirection(magnitude)}>{magnitude}</bdi>
    </span>
  );
}

/**
 * A compact card's figure. Money is set with its currency code small and quiet
 * beside the amount: the code is the same on every card, and at this size it
 * would otherwise take a third of the width the amount needs.
 */
function CompactFigure({ metric, shown, currency, decimals }) {
  if (shown.value === null) {
    return <p className="mt-2 text-[0.9375rem] font-bold text-(--color-text-subtle)">{EMPTY}</p>;
  }

  // Whole units on a compact card — the exact figure is its tooltip, its
  // screen-reader text, and the Analytics screen.
  const money =
    metric.format === 'money' ? formatMoneyParts(metric.value, { currency, decimals: 0 }) : null;

  if (!money) {
    return (
      <p className="tabular mt-2 truncate text-[0.9375rem] leading-tight font-bold text-(--color-text)">
        <bdi dir={figureDirection(shown.value)}>{shown.value}</bdi>
      </p>
    );
  }

  const code = (
    <span className="text-[0.625rem] font-semibold text-(--color-text-subtle)">
      {money.currency}
    </span>
  );

  return (
    <p className="tabular mt-2 leading-tight font-bold text-(--color-text)" title={shown.value}>
      <span className="sr-only">{shown.value}</span>
      <span aria-hidden="true" className="flex min-w-0 items-baseline gap-1">
        {money.position === 'before' && code}
        <bdi dir={figureDirection(money.amount)} className="truncate text-[0.9375rem]">
          {money.amount}
        </bdi>
        {money.position === 'after' && code}
      </span>
    </p>
  );
}
