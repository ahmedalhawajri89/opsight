'use client';

import { Sparkline } from '@/components/charts/Sparkline';
import { Icon } from '@/components/ui/Icon';
import { InfoTip } from '@/components/ui/Tooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { EMPTY, changeTone, figureDirection, formatPercent, formatPoints } from '@/lib/format';
import { useI18n } from '@/features/i18n/I18nProvider';
import { metricDefinition, metricLabel, presentMetric } from './MetricTile';

/**
 * The dashboard's KPIs, in two rows.
 *
 *   PRIMARY    four cards — a 40px tinted icon and the label, the figure, the
 *              change with its basis, and the period's shape as a sparkline
 *   COMPACT    eight small cards — icon, label, figure, change
 *
 * The row a metric lands in is decided here, but WHICH metrics exist is decided
 * by the server. A cost-blind role receives no cost keys, so each row fills
 * from its ordered list with whatever did arrive — a Staff user sees revenue,
 * orders, average order value and units on top rather than holes where profit
 * and margin would be (ROLES_AND_PERMISSIONS.md §4).
 *
 * Every figure, change and series is the server's. Nothing here computes.
 */
const PRIMARY_ORDER = [
  'net_revenue',
  'orders_count',
  'gross_profit',
  'gross_margin',
  'average_order_value',
  'units_sold',
];

const COMPACT_ORDER = [
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
 * Accent per metric: the icon's tint and, on a primary card, the sparkline.
 *
 * `costly` marks a metric whose unfavourable movement is money going out
 * rather than trade being lost. Its bad news is shown in amber, not red —
 * expenses rising is a warning to look at, not a failure (the specification's
 * rule, and a distinction a reader of a finance screen relies on).
 */
const VISUALS = {
  net_revenue: { icon: 'coins', accent: 'green' },
  orders_count: { icon: 'receipt', accent: 'blue' },
  gross_profit: { icon: 'wallet', accent: 'cyan' },
  gross_margin: { icon: 'percent', accent: 'teal' },
  average_order_value: { icon: 'percent', accent: 'blue' },
  new_customers: { icon: 'userPlus', accent: 'blue' },
  operating_expenses: { icon: 'wallet', accent: 'amber', costly: true },
  net_profit: { icon: 'trendUp', accent: 'green' },
  cancellation_rate: { icon: 'arrowDown', accent: 'red' },
  refund_rate: { icon: 'undo', accent: 'green' },
  units_sold: { icon: 'box', accent: 'blue' },
  returning_customers: { icon: 'repeat', accent: 'blue' },
};

const TINTS = {
  green: 'bg-(--color-success-soft) text-(--color-success)',
  blue: 'bg-(--color-info-soft) text-(--color-info)',
  cyan: 'bg-(--color-cyan-soft) text-(--color-cyan)',
  teal: 'bg-(--color-teal-soft) text-(--color-teal)',
  amber: 'bg-(--color-warning-soft) text-(--color-warning)',
  red: 'bg-(--color-danger-soft) text-(--color-danger)',
};

const SPARKS = {
  green: 'var(--spark-green)',
  blue: 'var(--spark-blue)',
  cyan: 'var(--spark-cyan)',
  teal: 'var(--spark-teal)',
  amber: 'var(--chart-2)',
  red: 'var(--negative)',
};

/** Splits the metrics that arrived into the two rows, with no key in both. */
export function tierMetrics(metrics = {}) {
  const primary = PRIMARY_ORDER.filter((key) => key in metrics).slice(0, PRIMARY_COUNT);
  const secondary = COMPACT_ORDER.filter((key) => key in metrics && !primary.includes(key));

  return { primary, secondary };
}

const CARD =
  'min-w-0 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card) transition-shadow duration-(--duration-base) ease-(--ease-out) hover:shadow-(--shadow-card-hover)';

export function KpiPanel({ metrics, trends = {}, currency, decimals, comparisonLabel, loading }) {
  const { t } = useI18n();

  if (loading) {
    return (
      <section aria-busy="true" className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className={cn(CARD, 'p-5')}>
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-(--radius-control)" />
                <Skeleton className="h-3.5 w-24" />
              </div>
              <Skeleton className="mt-5 h-7 w-40" />
              <Skeleton className="mt-3 h-4 w-44" />
              <Skeleton className="mt-4 h-10 w-full" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 min-[90rem]:grid-cols-8">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
            <div key={index} className={cn(CARD, 'p-3.5')}>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-5 w-24" />
              <Skeleton className="mt-2 h-3 w-12" />
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

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <CompactKpi
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
  const visual = VISUALS[metricKey] ?? { icon: 'analytics', accent: 'blue' };
  const series = Array.isArray(trend) ? trend.map((bucket) => bucket.value) : [];

  return (
    <div
      className={cn(CARD, 'rise @container flex flex-col p-5')}
      style={{ '--rise-index': index }}
    >
      {/*
        The label row is its own element and the heading is its direct child,
        so the card is always the heading's second ancestor — which the E2E
        suite relies on to find a card by its label.
      */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-(--radius-control)',
            TINTS[visual.accent],
          )}
        >
          <Icon name={visual.icon} size={20} strokeWidth={1.75} />
        </span>
        <h3 className="min-w-0 truncate text-sm font-semibold text-(--color-text)">{label}</h3>
        {definition && (
          <span className="ms-auto">
            <InfoTip label={label} content={definition} />
          </span>
        )}
      </div>

      {/*
        24px, shrinking with the card rather than truncating: a money figure
        cut to "BHD 69,54…" is a different number.
      */}
      <p
        className="tabular mt-4 text-[clamp(1.125rem,9.5cqi,1.5rem)] leading-none font-bold tracking-tight whitespace-nowrap text-(--color-text)"
        title={shown.value === null ? (metric.empty_reason ?? t('comparison.noValue')) : undefined}
      >
        {shown.value === null ? (
          <span className="text-(--color-muted)">{EMPTY}</span>
        ) : (
          <bdi dir={figureDirection(shown.value)}>{shown.value}</bdi>
        )}
      </p>

      <div className="mt-3 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
        <Change metric={metric} shown={shown} costly={visual.costly} size="md" />
        {comparisonLabel && (
          <span className="truncate text-xs text-(--color-muted)">{comparisonLabel}</span>
        )}
      </div>

      <div className="mt-auto pt-4">
        {series.filter((value) => value !== null).length > 1 ? (
          <Sparkline values={series} colour={SPARKS[visual.accent]} height={40} />
        ) : (
          <div aria-hidden="true" className="h-10" />
        )}
      </div>
    </div>
  );
}

function CompactKpi({ index, metricKey, metric, currency, decimals }) {
  const { t } = useI18n();
  const label = metricLabel(t, metricKey);
  const definition = metricDefinition(t, metricKey);
  const shown = presentMetric(metric, { currency, decimals });
  const visual = VISUALS[metricKey] ?? { icon: 'analytics', accent: 'blue' };

  return (
    <div
      className={cn(CARD, 'rise @container flex flex-col px-3 py-3')}
      style={{ '--rise-index': index }}
      title={definition}
    >
      {/*
        The icon sits in the label's own line, so a label that wraps uses the
        full card width on its second line. Up to two lines, never an ellipsis:
        "Averag…" names no metric. The reserved height keeps a row aligned.
      */}
      <h3 className="line-clamp-2 min-h-[2.5em] text-xs leading-[1.25] font-medium hyphens-auto text-(--color-text-2)">
        <span
          aria-hidden="true"
          className={cn(
            'me-1.5 inline-flex size-4 translate-y-[-1px] items-center justify-center rounded-(--radius-control) align-middle',
            TINTS[visual.accent],
          )}
        >
          <Icon name={visual.icon} size={10} strokeWidth={2.25} />
        </span>
        {label}
      </h3>

      {/*
        15px, shrinking with the card: the exact figure always fits whole, in
        its currency's own precision — never rounded to make room.
      */}
      <p className="tabular mt-2 text-[clamp(0.6875rem,11cqi,0.9375rem)] leading-tight font-bold whitespace-nowrap text-(--color-text)">
        {shown.value === null ? (
          <span className="text-(--color-muted)">{EMPTY}</span>
        ) : (
          <bdi dir={figureDirection(shown.value)}>{shown.value}</bdi>
        )}
      </p>

      <div className="mt-2">
        <Change metric={metric} shown={shown} costly={visual.costly} size="sm" />
      </div>
    </div>
  );
}

/**
 * The change: an arrow and a figure, coloured by what it means for the business.
 *
 * The arrow shows the arithmetic direction; the colour shows whether that is
 * good — expenses rising is not "up and green". A ratio changes in percentage
 * points, and says so.
 */
function Change({ metric, shown, costly = false, size }) {
  const { t } = useI18n();
  const change = shown.change;

  if (change === null || change === undefined) {
    return (
      <span className="tabular text-xs text-(--color-muted)" title={t('comparison.unavailable')}>
        {EMPTY}
      </span>
    );
  }

  const tone = changeTone(change, metric.favourable);
  const magnitude =
    shown.changeFormat === 'points'
      ? formatPoints(Math.abs(change)).replace('+', '')
      : formatPercent(Math.abs(change));

  const colour =
    tone === 'positive'
      ? 'text-(--color-success)'
      : tone === 'negative'
        ? costly
          ? 'text-(--color-warning)'
          : 'text-(--color-danger)'
        : 'text-(--color-text-2)';

  return (
    <span
      data-tone={tone}
      className={cn(
        'tabular inline-flex items-center gap-1 font-semibold whitespace-nowrap',
        size === 'md' ? 'text-sm' : 'text-xs',
        colour,
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
