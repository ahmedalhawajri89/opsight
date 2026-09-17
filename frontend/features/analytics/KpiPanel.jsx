'use client';

import { ComparisonValue } from '@/components/data/ComparisonValue';
import { InfoTip } from '@/components/ui/Tooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { EMPTY, figureDirection, formatMoneyParts } from '@/lib/format';
import { METRIC_DEFINITIONS, METRIC_LABELS, presentMetric } from './MetricTile';

/**
 * The dashboard's KPI section, in two tiers.
 *
 * Before the redesign all twelve metrics were identical tiles, so net revenue
 * and refund rate competed for attention on equal terms and the eye had no
 * place to start. Now:
 *
 *   PRIMARY    four figures that answer "how is the business doing", set large
 *   SECONDARY  eight that explain it, set small and quiet
 *
 * Both tiers are ONE panel divided by hairlines rather than a grid of framed
 * boxes: they are one reading of one period, and should look it.
 *
 * The tier a metric lands in is decided here, but WHICH metrics exist is
 * decided by the server. A cost-blind role receives no cost keys at all, so the
 * primary tier fills from the ordered list below with whatever did arrive —
 * a Staff user sees revenue, orders, average order value and new customers
 * rather than two holes where profit and margin would be
 * (ROLES_AND_PERMISSIONS.md §4).
 */
const PRIMARY_ORDER = [
  'net_revenue',
  'gross_profit',
  'gross_margin',
  'orders_count',
  'average_order_value',
  'new_customers',
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

/** Splits the metrics that arrived into the two tiers, with no key in both. */
export function tierMetrics(metrics = {}) {
  const primary = PRIMARY_ORDER.filter((key) => key in metrics).slice(0, PRIMARY_COUNT);
  const secondary = SECONDARY_ORDER.filter((key) => key in metrics && !primary.includes(key));

  return { primary, secondary };
}

export function KpiPanel({ metrics, currency, decimals, comparisonLabel, loading = false }) {
  if (loading) {
    return (
      <section aria-busy="true" className="space-y-3">
        <Band columns="sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="bg-(--color-surface) p-5">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="mt-4 h-8 w-40" />
              <Skeleton className="mt-4 h-4 w-32" />
            </div>
          ))}
        </Band>
      </section>
    );
  }

  const { primary, secondary } = tierMetrics(metrics);
  const context = { currency, decimals, comparisonLabel };

  return (
    <section aria-labelledby="kpi-heading" className="space-y-3">
      <h2 id="kpi-heading" className="sr-only">
        Key metrics
      </h2>

      <Band columns="sm:grid-cols-2 xl:grid-cols-4">
        {primary.map((key) => (
          <Kpi key={key} metricKey={key} metric={metrics[key]} tier="primary" {...context} />
        ))}
      </Band>

      {secondary.length > 0 && (
        <Band columns="grid-cols-2 xl:grid-cols-4">
          {secondary.map((key) => (
            <Kpi key={key} metricKey={key} metric={metrics[key]} tier="secondary" {...context} />
          ))}
        </Band>
      )}
    </section>
  );
}

/**
 * Cells separated by 1px hairlines.
 *
 * The lines are the panel's own background showing through a 1px grid gap, so
 * they stay correct at every column count — including the trailing row of an
 * odd count, which per-cell borders get wrong.
 */
function Band({ columns, children }) {
  return (
    <div
      className={cn(
        'grid gap-px overflow-hidden rounded-(--radius-lg) border border-(--color-line) bg-(--color-line-subtle) shadow-(--shadow-card)',
        columns,
      )}
    >
      {children}
    </div>
  );
}

function Kpi({ metricKey, metric, tier, currency, decimals, comparisonLabel }) {
  const label = METRIC_LABELS[metricKey] ?? metricKey;
  const shown = presentMetric(metric, { currency, decimals });
  const primary = tier === 'primary';

  return (
    <div
      className={cn(
        'min-w-0 bg-(--color-surface) transition-colors duration-150 hover:bg-(--color-surface-hover)/40',
        primary ? 'px-5 py-4.5' : 'px-4 py-3.5',
      )}
    >
      {/*
        The label row is its own element and the heading is its direct child,
        so the tile is always the heading's second ancestor — which the E2E
        suite relies on to find a tile by its label.
      */}
      <div className="flex items-center gap-1.5">
        <h3
          className={cn(
            'truncate font-medium text-(--color-text-muted)',
            primary ? 'text-[0.8125rem]' : 'text-xs',
          )}
        >
          {label}
        </h3>
        {METRIC_DEFINITIONS[metricKey] && (
          <InfoTip label={label} content={METRIC_DEFINITIONS[metricKey]} />
        )}
      </div>

      <FigureValue
        metric={metric}
        shown={shown}
        currency={currency}
        decimals={decimals}
        primary={primary}
      />

      <ComparisonValue
        change={shown.change}
        format={shown.changeFormat}
        favourable={metric.favourable}
        basis={comparisonLabel}
        variant="chip"
        className={primary ? 'mt-3' : 'mt-2'}
      />

      {shown.previous && (
        <p className="tabular mt-1.5 truncate text-xs text-(--color-text-subtle)">
          Previous <bdi dir={figureDirection(shown.previous)}>{shown.previous}</bdi>
        </p>
      )}
    </div>
  );
}

/**
 * The figure itself.
 *
 * Money is set as a large amount with a small, quiet currency code: the code is
 * identical on every figure in the installation, so giving it the same weight
 * as the digits only makes the digits harder to find. Its position follows the
 * locale rather than being assumed to lead.
 */
function FigureValue({ metric, shown, currency, decimals, primary }) {
  const empty = shown.value === null;
  const size = primary ? 'text-2xl sm:text-[1.75rem]' : 'text-lg';

  if (empty) {
    return (
      <p
        className={cn('tabular mt-2 leading-none font-semibold text-(--color-text-subtle)', size)}
        title={metric.empty_reason ?? 'No value for this period.'}
      >
        {EMPTY}
      </p>
    );
  }

  const money =
    metric.format === 'money' ? formatMoneyParts(metric.value, { currency, decimals }) : null;

  if (!money) {
    return (
      <p
        className={cn(
          'tabular mt-2 leading-none font-semibold tracking-tight text-(--color-text)',
          size,
        )}
      >
        <bdi dir={figureDirection(shown.value)}>{shown.value}</bdi>
      </p>
    );
  }

  const code = (
    <span
      className={cn(
        'font-medium tracking-normal text-(--color-text-subtle)',
        primary ? 'text-sm' : 'text-xs',
      )}
    >
      {money.currency}
    </span>
  );

  return (
    <p className={cn('tabular mt-2 leading-none font-semibold tracking-tight', size)}>
      {/*
        A screen reader gets the one formatted figure; the split is visual
        only. (aria-label on a paragraph is not reliably announced — a generic
        element's accessible name is ignored — so this is real text.)
      */}
      <span className="sr-only">{shown.value}</span>
      <span aria-hidden="true" className="flex items-baseline gap-1.5 text-(--color-text)">
        {money.position === 'before' && code}
        <bdi dir={figureDirection(money.amount)} className="truncate">
          {money.amount}
        </bdi>
        {money.position === 'after' && code}
      </span>
    </p>
  );
}
