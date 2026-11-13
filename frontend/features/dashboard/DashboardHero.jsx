'use client';

import Link from 'next/link';
import { gsap } from 'gsap';

import { Sparkline } from '@/components/charts/Sparkline';
import { Icon } from '@/components/ui/Icon';
import { metricLabel, presentMetric } from '@/features/analytics/MetricTile';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useGsap } from '@/hooks/useGsap';
import { cn } from '@/lib/cn';
import {
  EMPTY,
  changeTone,
  figureDirection,
  formatDate,
  formatPercent,
  formatPoints,
} from '@/lib/format';

import { Amount } from './Amount';

/**
 * The navy band at the top of the dashboard: one large figure and three
 * beside it, each with the shape of its period underneath.
 *
 * THE LARGE FIGURE IS THE ANSWER TO "DID I MAKE MONEY?" For a role that may
 * see cost that is net profit, after cost of goods AND operating expenses,
 * with the net margin beside it. A role without cost receives no profit keys
 * at all, so its large figure is sales, and the band says plainly that cost
 * and profit are not shown, rather than leaving a hole.
 *
 * The third small figure is the lowest cash balance the thirteen-week
 * forecast expects. It is only there for a role that may see the forecast.
 *
 * Nothing here computes. Every figure, change and series is the server's;
 * the sparklines only scale the server's values to fit their box.
 */
export function DashboardHero({
  metrics,
  trends,
  cash,
  canSeeCost,
  currency,
  decimals,
  comparisonLabel,
  loading,
}) {
  const { t, locale } = useI18n();
  const money = { currency, decimals };
  const primaryKey = canSeeCost && metrics.net_profit ? 'net_profit' : 'net_revenue';
  const ready = !loading && metrics[primaryKey];

  const root = useGsap(
    (self) => {
      const q = self.selector;

      gsap
        .timeline({ defaults: { ease: 'power2.out' } })
        .from(q('[data-band]'), { opacity: 0, y: 12, duration: 0.5 })
        .from(q('[data-band-wave]'), { opacity: 0, duration: 1.1 }, 0.15)
        .from(q('[data-band-figure]'), { opacity: 0, y: 10, duration: 0.45, stagger: 0.07 }, 0.2);
    },
    [locale, primaryKey, Boolean(ready)],
  );

  const secondary = canSeeCost
    ? [
        { key: 'net_revenue', series: trends.revenue, href: '/analytics' },
        { key: 'orders_count', series: trends.orders, href: '/orders', note: 'aov' },
        { key: 'cash' },
      ]
    : [
        { key: 'orders_count', series: trends.orders, href: '/orders' },
        { key: 'average_order_value', series: trends.aov, href: '/orders' },
        { key: 'units_sold', href: '/products' },
      ];

  return (
    <section ref={root} aria-label={t('dashboard.home.hero.label')}>
      <div
        data-band
        className="relative isolate overflow-hidden rounded-(--radius-auth) bg-(--color-brand-panel) px-6 py-7 text-(--color-on-brand) sm:px-8"
      >
        <BandWave />

        <div className="flex flex-wrap gap-x-0 gap-y-7">
          <div data-band-figure className="min-w-0 flex-[1.4_1_20rem] lg:pe-7">
            {ready ? (
              <PrimaryFigure
                metricKey={primaryKey}
                metrics={metrics}
                money={money}
                canSeeCost={canSeeCost}
                comparisonLabel={comparisonLabel}
              />
            ) : (
              <PrimarySkeleton />
            )}
          </div>

          <div className="flex min-w-0 flex-[2_1_32rem] flex-wrap gap-y-6">
            {secondary.map((item) =>
              item.key === 'cash' ? (
                <CashFigure key="cash" cash={cash} money={money} />
              ) : (
                <SmallFigure
                  key={item.key}
                  metricKey={item.key}
                  metric={metrics[item.key]}
                  aov={item.note === 'aov' ? metrics.average_order_value : null}
                  series={item.series}
                  href={item.href}
                  money={money}
                  loading={loading}
                />
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function PrimaryFigure({ metricKey, metrics, money, canSeeCost, comparisonLabel }) {
  const { t } = useI18n();
  const metric = metrics[metricKey];
  const shown = presentMetric(metric, money);
  const margin = metrics.net_margin?.value;
  const isProfit = metricKey === 'net_profit';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          aria-hidden="true"
          className="inline-flex size-7 items-center justify-center rounded-(--radius-control) bg-(--color-on-brand-raise) text-(--color-accent-on-brand)"
        >
          <Icon name={isProfit ? 'pie' : 'coins'} size={15} strokeWidth={2} />
        </span>
        <h2 className="text-sm font-medium text-(--color-on-brand-2)">
          {isProfit ? t('dashboard.home.hero.netProfit') : t('dashboard.home.hero.sales')}
        </h2>
        {isProfit && (
          <span className="rounded-(--radius-pill) bg-(--color-accent-on-brand) px-2 py-px text-[0.6875rem] font-semibold text-(--color-brand-panel)">
            {t('dashboard.home.hero.afterExpenses')}
          </span>
        )}
      </div>

      <Amount
        value={metric.value}
        {...money}
        className="text-[2.75rem] leading-none font-bold tracking-tight sm:text-[3.25rem]"
        currencyClassName="text-xl text-(--color-on-brand-2)"
      />

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--color-on-brand-2)">
        <InkChange metric={metric} shown={shown} />
        {comparisonLabel && <span>{comparisonLabel}</span>}
        {isProfit && margin !== null && margin !== undefined && (
          <>
            <span aria-hidden="true" className="text-(--color-on-brand-line)">
              |
            </span>
            <span>
              {t('dashboard.home.hero.netMargin')}{' '}
              <strong className="tabular font-semibold text-(--color-on-brand)">
                {formatPercent(margin)}
              </strong>
            </span>
          </>
        )}
        {!canSeeCost && (
          <span className="inline-flex items-center gap-1.5">
            <Icon name="lock" size={13} className="text-(--color-accent-on-brand)" />
            {t('dashboard.home.hero.costHidden')}
          </span>
        )}
      </div>
    </div>
  );
}

function SmallFigure({ metricKey, metric, aov, series, href, money, loading }) {
  const { t } = useI18n();

  if (!metric) {
    return loading ? <SmallSkeleton /> : null;
  }

  const shown = presentMetric(metric, money);
  const isMoney = metric.format === 'money';
  const values = (series ?? []).map((bucket) => bucket.value);

  const body = (
    <>
      <h3 className="text-[0.8125rem] text-(--color-on-brand-2)">{metricLabel(t, metricKey)}</h3>
      <span className="text-2xl leading-none font-bold tracking-tight whitespace-nowrap min-[90rem]:text-[1.75rem]">
        {isMoney ? (
          <Amount
            value={metric.value}
            {...money}
            currencyClassName="text-[0.8125rem] text-(--color-on-brand-2)"
          />
        ) : (
          <span className="tabular">{shown.value ?? EMPTY}</span>
        )}
      </span>
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-(--color-on-brand-2)">
        <InkChange metric={metric} shown={shown} />
        {aov?.value && (
          <span>
            {metricLabel(t, 'average_order_value')}{' '}
            <span className="tabular">{presentMetric(aov, money).value}</span>
          </span>
        )}
      </span>
      {values.length > 1 && (
        <Sparkline values={values} colour="var(--on-brand-2)" height={28} className="mt-1" />
      )}
    </>
  );

  return (
    <div
      data-band-figure
      className="flex min-w-0 flex-[1_1_11rem] flex-col border-(--color-on-brand-line)/30 px-0 sm:border-s sm:px-6"
    >
      <Link
        href={href}
        className="-m-2 flex flex-col gap-2.5 rounded-(--radius-control) p-2 transition-colors duration-(--duration-fast) hover:bg-(--color-on-brand)/5"
      >
        {body}
      </Link>
    </div>
  );
}

/**
 * The lowest balance the forecast expects, and the week it falls in. Without
 * a stated opening balance the forecast has a shape but no level, so the
 * figure would be meaningless; it asks for the balance instead.
 */
function CashFigure({ cash, money }) {
  const { t } = useI18n();

  if (!cash) return <SmallSkeleton />;

  const hasBalance = cash.opening_balance !== null && cash.opening_balance !== undefined;
  const lowest = cash.lowest;
  const series = (cash.weeks ?? []).map((week) => week.running);

  return (
    <div
      data-band-figure
      className="flex min-w-0 flex-[1_1_11rem] flex-col border-(--color-on-brand-line)/30 px-0 sm:border-s sm:px-6"
    >
      <Link
        href="/forecasts"
        className="-m-2 flex flex-col gap-2.5 rounded-(--radius-control) p-2 transition-colors duration-(--duration-fast) hover:bg-(--color-on-brand)/5"
      >
        <h3 className="text-[0.8125rem] text-(--color-on-brand-2)">
          {t('dashboard.home.hero.lowestCash')}
        </h3>
        {hasBalance && lowest ? (
          <>
            <span className="text-2xl leading-none font-bold tracking-tight whitespace-nowrap min-[90rem]:text-[1.75rem]">
              <Amount
                value={lowest.value}
                {...money}
                currencyClassName="text-[0.8125rem] text-(--color-on-brand-2)"
              />
            </span>
            <span className="text-xs text-(--color-accent-on-brand)">
              {t('dashboard.home.hero.lowestCashOn', { date: formatDate(lowest.start) })}
            </span>
            {series.length > 1 && (
              <Sparkline
                values={series}
                colour="var(--accent-on-brand)"
                height={28}
                className="mt-1"
              />
            )}
          </>
        ) : (
          <span className="text-sm leading-relaxed text-(--color-on-brand)">
            {t('dashboard.home.hero.lowestCashNoBalance')}
          </span>
        )}
      </Link>
    </div>
  );
}

/**
 * A figure's movement, on ink. changeTone reads the metric's favourable
 * direction, and the arrow stays so colour never carries the verdict alone.
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
        'tabular inline-flex items-center gap-1 rounded-(--radius-control) bg-(--color-on-brand)/8 px-2 py-0.5 font-semibold',
        tone === 'positive'
          ? 'text-(--color-success-on-brand)'
          : tone === 'negative'
            ? 'text-(--color-danger-on-brand)'
            : 'text-(--color-on-brand-2)',
      )}
    >
      <bdi dir={figureDirection(magnitude)}>{magnitude}</bdi>
      <Icon
        name={change > 0 ? 'arrowUp' : change < 0 ? 'arrowDown' : 'arrowRight'}
        size={12}
        strokeWidth={2.5}
        label={change > 0 ? t('comparison.up') : change < 0 ? t('comparison.down') : undefined}
      />
    </span>
  );
}

function PrimarySkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-3">
      <div className="h-7 w-48 animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
      <div className="h-12 w-72 max-w-full animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
      <div className="h-5 w-56 animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
    </div>
  );
}

function SmallSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex min-w-0 flex-[1_1_11rem] flex-col gap-3 border-(--color-on-brand-line)/30 sm:border-s sm:px-6"
    >
      <div className="h-4 w-24 animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
      <div className="h-7 w-32 animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
      <div className="h-7 w-full animate-pulse rounded-(--radius-control) bg-(--color-on-brand)/10" />
    </div>
  );
}

/** Two faint gold lines across the foot of the band. Ornament only. */
function BandWave() {
  return (
    <svg
      data-band-wave
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 1200 220"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 -z-10 size-full"
    >
      <path
        d="M0 190 C 160 150, 300 215, 470 178 S 760 120, 900 160 S 1120 200, 1200 150"
        fill="none"
        strokeWidth="1.5"
        vectorEffect="non-scaling-stroke"
        className="stroke-(--color-accent-on-brand)/45"
      />
      <path
        d="M0 205 C 180 172, 320 228, 490 196 S 770 142, 920 178 S 1130 214, 1200 172"
        fill="none"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
        className="stroke-(--color-accent-on-brand)/22"
      />
    </svg>
  );
}
