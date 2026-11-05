'use client';

import Link from 'next/link';
import { gsap } from 'gsap';

import { CountUp } from '@/components/data/CountUp';
import { Icon } from '@/components/ui/Icon';
import { tierMetrics } from '@/features/analytics/KpiPanel';
import { metricLabel, presentMetric } from '@/features/analytics/MetricTile';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useGsap } from '@/hooks/useGsap';
import { cn } from '@/lib/cn';
import { EMPTY, changeTone, figureDirection, formatPercent, formatPoints } from '@/lib/format';
import { greeting } from '@/lib/person';

/**
 * The top of the dashboard: who this is for, the three figures that matter,
 * and where to go next — on the same ink as the sign-in panel.
 *
 * WHY THREE, AND WHY HERE. The dashboard used to open on twelve figures of
 * equal weight, and a reader who lands with a question had nowhere for the
 * eye to start. The band answers the first question anyone asks of a shop —
 * how is it going? — with the first three figures the server's role-aware
 * ordering produces (tierMetrics), so a Staff user, who receives no cost
 * keys, sees revenue, orders and average order value rather than a hole
 * where profit would be. The rest are one click away on Analytics.
 *
 * THE LINE ACROSS THE BOTTOM IS THE PERIOD'S REVENUE, not an ornament. It is
 * the server's own series, drawn faint and without axes: the shape of the
 * month behind the number above it. Decorative, so `aria-hidden`; the figures
 * carry the information.
 *
 * Each figure is a link to the screen that explains it, so "where do I go to
 * understand this?" is answered by the figure itself.
 *
 * Nothing here computes. Figures, changes and the series are the server's.
 */

/* Where a reader goes to understand a figure. A metric absent here is not a link. */
const DESTINATIONS = {
  net_revenue: '/analytics',
  orders_count: '/orders',
  gross_profit: '/analytics',
  gross_margin: '/analytics',
  average_order_value: '/orders',
  units_sold: '/products',
};

const GLYPHS = {
  net_revenue: 'coins',
  orders_count: 'receipt',
  gross_profit: 'wallet',
  gross_margin: 'percent',
  average_order_value: 'cart',
  units_sold: 'box',
};

const HEADLINE_COUNT = 3;

export function DashboardHero({
  metrics,
  revenueTrend,
  currency,
  decimals,
  comparisonLabel,
  loading,
}) {
  const { user, can } = useAuth();
  const { t, locale } = useI18n();

  const keys = tierMetrics(metrics).primary.slice(0, HEADLINE_COUNT);
  const line = trendPath(revenueTrend);

  const root = useGsap(
    (self) => {
      const q = self.selector;

      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from(q('[data-band]'), { opacity: 0, y: 16, duration: 0.6 })
        .from(q('[data-band-curve]'), { xPercent: 8, opacity: 0, duration: 0.9 }, 0.1)
        .from(q('[data-band-text]'), { opacity: 0, y: 10, duration: 0.5, stagger: 0.08 }, 0.2)
        .from(q('[data-band-figure]'), { opacity: 0, y: 14, duration: 0.55, stagger: 0.09 }, 0.35)
        .from(
          q('[data-band-line]'),
          { strokeDashoffset: 1, duration: 1.6, ease: 'power2.inOut' },
          0.4,
        )
        .from(q('[data-band-area]'), { opacity: 0, duration: 1.2 }, 0.9);
    },
    // Re-run when the figures arrive, so they enter rather than pop in.
    [locale, keys.join()],
  );

  return (
    <section ref={root} aria-labelledby="dashboard-title">
      <div
        data-band
        className="relative isolate overflow-hidden rounded-(--radius-auth) bg-linear-to-br from-(--color-brand-panel) to-(--color-brand-panel-deep) px-6 pt-7 pb-8 text-(--color-on-brand) sm:ps-8 sm:pe-[max(2rem,12%)] lg:ps-10"
      >
        <BandDecoration line={line} />

        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0">
            {/*
              The page's name leads the heading for assistive technology, so a
              screen reader announces "Dashboard" before the greeting.
            */}
            <h1
              id="dashboard-title"
              data-band-text
              className="text-2xl leading-tight font-bold tracking-tight sm:text-3xl"
            >
              <span className="sr-only">{t('nav.items.dashboard')} — </span>
              {greeting(t, user?.name)}
            </h1>
            <p data-band-text className="mt-2 text-base text-(--color-on-brand-2)">
              {t('dashboard.band.subtitle')}
            </p>
          </div>

          <QuickActions can={can} />
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-3 sm:gap-0">
          {loading && keys.length === 0
            ? [0, 1, 2].map((index) => <FigureSkeleton key={index} first={index === 0} />)
            : keys.map((key, index) => (
                <Figure
                  key={key}
                  metricKey={key}
                  metric={metrics[key]}
                  first={index === 0}
                  currency={currency}
                  decimals={decimals}
                  comparisonLabel={comparisonLabel}
                />
              ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The next step, offered rather than hunted for. Only what the reader's role
 * may do: a link to a screen they cannot open is a link to a refusal.
 */
function QuickActions({ can }) {
  const { t } = useI18n();

  const actions = [
    can('orders.create') && {
      href: '/orders/new',
      label: t('dashboard.band.newOrder'),
      icon: 'plus',
      primary: true,
    },
    can('inventory.view') && {
      href: '/inventory',
      label: t('dashboard.band.inventory'),
      icon: 'shelves',
    },
    can('analytics.view') && {
      href: '/analytics',
      label: t('dashboard.band.analytics'),
      icon: 'chart',
    },
  ].filter(Boolean);

  if (actions.length === 0) return null;

  return (
    <nav data-band-text aria-label={t('dashboard.band.actions')} className="flex flex-wrap gap-2">
      {actions.map((action) => (
        <Link
          key={action.href}
          href={action.href}
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-(--radius-pill) px-4 text-sm font-semibold transition-colors duration-(--duration-fast)',
            action.primary
              ? 'bg-(--color-accent-on-brand) text-(--color-brand-panel) hover:bg-(--color-accent-on-brand-strong)'
              : 'border border-(--color-on-brand-line)/35 text-(--color-on-brand) hover:border-(--color-accent-on-brand) hover:bg-(--color-on-brand)/6',
          )}
        >
          <Icon name={action.icon} size={16} />
          {action.label}
        </Link>
      ))}
    </nav>
  );
}

function Figure({ metricKey, metric, first, currency, decimals, comparisonLabel }) {
  const { t } = useI18n();
  const shown = presentMetric(metric, { currency, decimals });
  const destination = DESTINATIONS[metricKey];
  const label = metricLabel(t, metricKey);

  const body = (
    <>
      {/*
        The label is an h3, as a figure's label is on every card in the
        product: the heading outline then reads "Dashboard, Net revenue,
        Orders…", and a chart titled the same (an h2) stays distinguishable.
      */}
      <div className="flex items-center gap-2 text-sm font-medium text-(--color-on-brand-2)">
        <span
          aria-hidden="true"
          className="inline-flex size-7 items-center justify-center rounded-(--radius-control) bg-(--color-accent-on-brand)/15 text-(--color-accent-on-brand)"
        >
          <Icon name={GLYPHS[metricKey] ?? 'analytics'} size={15} />
        </span>
        <h3 className="min-w-0 truncate">{label}</h3>
        {destination && (
          <Icon
            name="arrowRight"
            size={14}
            className="ms-auto opacity-0 transition-[opacity,transform] duration-(--duration-base) group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
          />
        )}
      </div>
      <div className="mt-3">
        <span className="tabular block text-3xl leading-none font-bold tracking-tight">
          {shown.raw === null ? EMPTY : <CountUp value={shown.raw} format={shown.format} />}
        </span>
        <span className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--color-on-brand-2)">
          <InkChange metric={metric} shown={shown} />
          {comparisonLabel && <span>{comparisonLabel}</span>}
        </span>
      </div>
    </>
  );

  const frame = cn(
    'relative block rounded-(--radius-card) sm:px-6',
    first ? 'sm:ps-0' : 'sm:border-s sm:border-(--color-on-brand-line)/25',
  );

  return (
    <div data-band-figure className={frame}>
      {destination ? (
        <Link
          href={destination}
          className="group -m-2 block rounded-(--radius-control) p-2 transition-colors duration-(--duration-fast) hover:bg-(--color-on-brand)/5"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  );
}

/**
 * A figure's movement, on ink. The same verdict as the cards elsewhere
 * (changeTone reads the metric's favourable direction), with the arrow kept
 * so colour is never the only carrier of it.
 */
function InkChange({ metric, shown }) {
  const { t } = useI18n();
  const change = shown.change;

  if (change === null || change === undefined) {
    return <span title={t('comparison.unavailable')}>{EMPTY}</span>;
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
        'tabular inline-flex items-center gap-1 rounded-(--radius-pill) bg-(--color-on-brand)/8 px-2 py-0.5 font-semibold',
        tone === 'positive'
          ? 'text-(--color-success-on-brand)'
          : tone === 'negative'
            ? 'text-(--color-danger-on-brand)'
            : 'text-(--color-on-brand-2)',
      )}
    >
      <Icon
        name={change > 0 ? 'arrowUp' : change < 0 ? 'arrowDown' : 'arrowRight'}
        size={12}
        strokeWidth={2.5}
        label={change > 0 ? t('comparison.up') : change < 0 ? t('comparison.down') : undefined}
      />
      <bdi dir={figureDirection(magnitude)}>{magnitude}</bdi>
    </span>
  );
}

function FigureSkeleton({ first }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'sm:px-6',
        first ? 'sm:ps-0' : 'sm:border-s sm:border-(--color-on-brand-line)/25',
      )}
    >
      <div className="h-7 w-32 animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
      <div className="mt-3 h-8 w-44 animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
      <div className="mt-3 h-5 w-28 animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
    </div>
  );
}

/**
 * The band's drawing: the accent curve at the end of the line, a faint dot
 * grid, and the period's revenue as a line across the foot. The curve is
 * drawn for the END of an English line; in Arabic it is mirrored.
 */
function BandDecoration({ line }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(var(--color-on-brand-line)_1px,transparent_1px)] bg-size-[22px_22px] opacity-[0.12] [mask-image:linear-gradient(to_bottom,black,transparent_85%)]" />

      <svg
        data-band-curve
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="absolute inset-y-0 end-0 hidden h-full w-[14%] min-w-24 sm:block rtl:-scale-x-100"
        focusable="false"
      >
        <path
          d="M58 0C30 22 74 48 42 72C26 86 38 94 46 100H100V0Z"
          className="fill-(--color-accent-on-brand)/90"
        />
        <path
          d="M72 0C44 22 88 48 56 72C40 86 52 94 60 100H100V0Z"
          className="fill-(--color-brand-panel-deep)"
        />
      </svg>

      {line && (
        <svg
          viewBox="0 0 1000 100"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 h-28 w-full"
          focusable="false"
        >
          <defs>
            <linearGradient id="band-area" x1="0" x2="0" y1="0" y2="1">
              <stop
                offset="0"
                style={{ stopColor: 'var(--color-accent-on-brand)', stopOpacity: 0.22 }}
              />
              <stop
                offset="1"
                style={{ stopColor: 'var(--color-accent-on-brand)', stopOpacity: 0 }}
              />
            </linearGradient>
          </defs>
          <path data-band-area d={line.area} fill="url(#band-area)" />
          <path
            data-band-line
            d={line.stroke}
            pathLength="1"
            strokeDasharray="1"
            fill="none"
            vectorEffect="non-scaling-stroke"
            strokeWidth="2"
            strokeLinejoin="round"
            className="stroke-(--color-accent-on-brand)/70"
          />
        </svg>
      )}
    </div>
  );
}

/**
 * The series as an SVG path in a 1000 × 100 box, leaving headroom so the line
 * never touches the figures above it. Null when there is nothing to draw.
 *
 * This scales the server's values to fit a box; it does not compute a figure.
 */
export function trendPath(series) {
  const values = Array.isArray(series)
    ? series.map((bucket) => Number(bucket.value)).filter((value) => Number.isFinite(value))
    : [];

  if (values.length < 2) return null;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = 1000 / (values.length - 1);
  const points = values.map((value, index) => [index * step, 96 - ((value - min) / span) * 70]);

  /*
   * Through every point, as curves rather than corners: a Catmull-Rom spline
   * written as cubic Béziers. Daily trade is spiky, and straight segments drew
   * a row of mountain peaks where the reader should see a tide.
   */
  const at = (index) => points[Math.max(0, Math.min(points.length - 1, index))];
  const fixed = (value) => value.toFixed(1);
  let stroke = `M${fixed(points[0][0])} ${fixed(points[0][1])}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = at(index - 1);
    const [x1, y1] = at(index);
    const [x2, y2] = at(index + 1);
    const [x3, y3] = at(index + 2);

    stroke +=
      `C${fixed(x1 + (x2 - x0) / 6)} ${fixed(y1 + (y2 - y0) / 6)} ` +
      `${fixed(x2 - (x3 - x1) / 6)} ${fixed(y2 - (y3 - y1) / 6)} ${fixed(x2)} ${fixed(y2)}`;
  }

  return { stroke, area: `${stroke}L1000 100L0 100Z` };
}
