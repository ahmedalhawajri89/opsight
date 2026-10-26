'use client';

import Link from 'next/link';

import { CountUp } from '@/components/data/CountUp';
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
 * Where a reader goes to understand a figure.
 *
 * Not every metric has somewhere better than the screen it is already on:
 * a margin is explained by the analytics screen, but there is no "margin
 * list". A metric absent from here simply gets no arrow, rather than a link
 * that lands somewhere unhelpful.
 */
const DESTINATIONS = {
  net_revenue: '/analytics',
  orders_count: '/orders',
  gross_profit: '/analytics',
  gross_margin: '/analytics',
  average_order_value: '/orders',
  units_sold: '/products',
};

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


/** Splits the metrics that arrived into the two rows, with no key in both. */
export function tierMetrics(metrics = {}) {
  const primary = PRIMARY_ORDER.filter((key) => key in metrics).slice(0, PRIMARY_COUNT);
  const secondary = COMPACT_ORDER.filter((key) => key in metrics && !primary.includes(key));

  return { primary, secondary };
}

const CARD =
  'min-w-0 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card) transition-shadow duration-(--duration-base) ease-(--ease-out) hover:shadow-(--shadow-card-hover)';

export function KpiPanel({ metrics, currency, decimals, comparisonLabel, loading }) {
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
        <div className="grid grid-cols-2 divide-(--color-line-subtle) overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) sm:grid-cols-4 sm:divide-x rtl:sm:divide-x-reverse min-[90rem]:grid-cols-8">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => (
            <div key={index} className="border-b border-(--color-line-subtle) px-3.5 py-3 sm:border-b-0">
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
            {...context}
          />
        ))}
      </div>

      {secondary.length > 0 && (
        /*
          ONE quiet surface, divided — not eight more cards.

          The reference screen has four figures and nothing else, and its
          calm comes from that restraint. These eight are real metrics that
          roles depend on, so they stay; what goes is their competition with
          the four above. No border each, no shadow each, no hover lift: a
          strip of supporting figures, read after the headline rather than
          alongside it.
        */
        <div
          className={cn(
            'grid grid-cols-2 divide-(--color-line-subtle) overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) sm:grid-cols-4 sm:divide-x rtl:sm:divide-x-reverse',
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

function PrimaryKpi({ index, metricKey, metric, currency, decimals, comparisonLabel }) {
  const { t } = useI18n();
  const label = metricLabel(t, metricKey);
  const definition = metricDefinition(t, metricKey);
  const shown = presentMetric(metric, { currency, decimals });
  const visual = VISUALS[metricKey] ?? { icon: 'analytics', accent: 'blue' };
  const destination = DESTINATIONS[metricKey];

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
        Figure and movement on ONE row, which is the reference layout's whole
        trick: the eye lands on the number and the direction together instead
        of travelling down to find out which way it went.

        The figure shrinks with the card rather than truncating — a money
        figure cut to "BHD 69,54…" is a different number — and the pill never
        shrinks, so a narrow card squeezes the figure and keeps the verdict
        legible.
      */}
      <div className="mt-5 flex items-end justify-between gap-3">
      <p
        className="tabular min-w-0 text-[clamp(1.125rem,8.5cqi,1.625rem)] leading-none font-bold tracking-tight whitespace-nowrap text-(--color-text)"
        title={shown.value === null ? (metric.empty_reason ?? t('comparison.noValue')) : undefined}
      >
        {shown.value === null ? (
          <span className="text-(--color-muted)">{EMPTY}</span>
        ) : (
          <bdi dir={figureDirection(shown.value)}>
            {/*
              Counted up only on the four primary cards. Twelve figures all
              counting at once is a slot machine, not a dashboard — the
              compact row prints its values outright.
            */}
            <CountUp value={shown.raw} format={shown.format} />
          </bdi>
        )}
      </p>

        <Change metric={metric} shown={shown} costly={visual.costly} size="pill" />
      </div>

      {/*
        The comparison basis, once, quietly. It is the same sentence on all
        four cards, so it reads as a caption rather than four facts.
      */}
      {comparisonLabel && (
        <p className="mt-2 truncate text-xs text-(--color-muted)">{comparisonLabel}</p>
      )}

      <div className="mt-auto" />

      {/*
        A figure that cannot be investigated is a poster. Each card now ends
        where the reader would go next to understand it — orders to the order
        list, revenue to analytics — and says how much the figure moved in its
        own unit, which the percentage beside it does not.

        A link inside the card rather than the card as a link: the E2E suite
        finds a card through its heading's ancestors, and wrapping the whole
        thing in an anchor would also make every sparkline and tooltip inside
        it part of one enormous click target.
      */}
      {destination && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-(--color-line-subtle) pt-3">
          {/*
            A signed figure alone is ambiguous \u2014 the movement, or another
            number? The comparison basis is already stated higher up the
            card, so rather than repeat it in a cramped footer the movement
            is named for a screen reader and on hover.
          */}
          {shown.delta === null ? (
            <span aria-hidden="true">&nbsp;</span>
          ) : (
            <span
              className="tabular min-w-0 truncate text-xs text-(--color-text-2)"
              title={t('dashboard.movement')}
            >
              <span className="sr-only">{t('dashboard.movement')}: </span>
              {shown.delta}
            </span>
          )}

          <Link
            href={destination}
            aria-label={t('dashboard.investigate', { metric: label })}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-(--color-line) text-(--color-text-2) transition-colors hover:border-(--color-brand) hover:bg-(--color-brand-soft) hover:text-(--color-brand-text)"
          >
            {/* Logical: the arrow points the way reading runs, so it flips
                with the page rather than pointing back in Arabic. */}
            <Icon name="arrowRight" size={15} className="rtl:-scale-x-100" />
          </Link>
        </div>
      )}
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
      className={cn(
        'rise @container flex flex-col border-b border-(--color-line-subtle) px-3.5 py-3 transition-colors duration-(--duration-fast) last:border-b-0 hover:bg-(--color-ground) sm:border-b-0',
      )}
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

  if (size === 'pill') {
    /*
     * A filled pill rather than coloured text, as the reference has it. The
     * arrow stays: colour alone must never be the only carrier of a verdict,
     * and roughly one reader in twelve cannot separate the red from the
     * green (UI_UX_DIRECTION.md).
     */
    const fill =
      tone === 'positive'
        ? 'bg-(--color-success-soft) text-(--color-success)'
        : tone === 'negative'
          ? costly
            ? 'bg-(--color-warning-soft) text-(--color-warning)'
            : 'bg-(--color-danger-soft) text-(--color-danger)'
          : 'bg-(--color-surface-subtle) text-(--color-text-2)';

    return (
      <span
        data-tone={tone}
        className={cn(
          'tabular inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold whitespace-nowrap',
          fill,
        )}
      >
        <span aria-hidden="true">{tone === 'negative' ? '▼' : tone === 'positive' ? '▲' : '→'}</span>
        {magnitude}
      </span>
    );
  }

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
