'use client';

import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { gsap } from 'gsap';

import { getMoneyDefaults } from '@/lib/format';
import { useDashboard } from '@/features/analytics/useAnalytics';
import { PeriodStatus } from '@/features/analytics/DashboardPanels';
import { useAuth } from '@/features/auth/AuthProvider';
import { DashboardHero } from '@/features/dashboard/DashboardHero';
import { DashboardIntro } from '@/features/dashboard/DashboardIntro';
import { ProfitBreakdown } from '@/features/dashboard/ProfitBreakdown';
import { AskCard, ReadyCard } from '@/features/dashboard/SideCards';
import { ChannelMix } from '@/features/dashboard/ChannelMix';
import { StockRunway } from '@/features/dashboard/StockRunway';
import { WeekActions } from '@/features/dashboard/WeekActions';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useInsights } from '@/features/insights/useInsights';
import { ErrorState } from '@/components/data/States';
import { TopBarPortal } from '@/components/layout/AppShell';
import { Card } from '@/components/layout/PageHeader';
import { InView } from '@/components/data/InView';
import { PeriodControls } from '@/components/layout/PeriodControls';
import { useGsap } from '@/hooks/useGsap';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { EmptyPeriodNotice } from '@/features/analytics/EmptyPeriodNotice';
import { SeasonNotice } from '@/features/analytics/SeasonNotice';
import { resolvePreset } from '@/lib/periods';
import { queryKeys } from '@/lib/queryKeys';
import * as briefService from '@/services/brief';
import * as forecasts from '@/services/forecasts';

/*
 * The charts arrive on their own: Recharts is large, and the figures, which
 * are the point, should paint without waiting for the library that draws
 * their history. `ssr: false` because it measures the DOM it is in.
 */
const DailyChart = dynamic(
  () => import('@/features/dashboard/DailyChart').then((module) => module.DailyChart),
  { ssr: false },
);
const CashOutlook = dynamic(
  () => import('@/features/dashboard/CashOutlook').then((module) => module.CashOutlook),
  { ssr: false },
);

const PERIOD_CONFIG = {
  defaults: { preset: '30d', comparison: 'previous_period' },
  allowed: ['preset', 'from', 'to', 'comparison'],
  sortable: [],
};

/**
 * The dashboard, in the order a merchant asks (redesign, 2026-11-13):
 *
 *   1  DID I MAKE MONEY?           net profit and three figures on the navy band
 *   2  WHAT SHOULD I DO?           three ranked steps for this week
 *   3  WHAT SHAPE WAS IT?          revenue and profit by day; revenue to profit
 *   4  WILL I HAVE CASH?           thirteen weeks of balance; sales by channel
 *   5  WHAT RUNS OUT?              the products closest to running out
 *      and beside it, Ask Baydar and what is ready to read.
 *
 * Every number comes from the server: the dashboard, insights, cash and stock
 * forecasts, and the brief. This page computes nothing.
 *
 * WHAT A ROLE CANNOT SEE IS ABSENT, NOT EMPTY. Profit, the profit breakdown
 * and the cash forecast are requested and drawn only for a role that may see
 * cost; the stock card only for a role that may see inventory.
 */
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
  const { can, user } = useAuth();
  const { t, locale } = useI18n();
  const { filters, setFilters } = useUrlFilters(PERIOD_CONFIG);
  const wide = useMediaQuery('(min-width: 90rem)');

  const canSeeCost = can('metrics.view_cost');
  const canSeeStock = can('inventory.view');

  const period = {
    preset: filters.preset,
    from: filters.from,
    to: filters.to,
    comparison: filters.comparison,
  };

  const { dashboard, meta, isLoading, isError, error, refetch } = useDashboard(period);
  const insights = useInsights(period);

  const cash = useQuery({
    queryKey: queryKeys.forecasts.cash,
    queryFn: forecasts.cash,
    enabled: canSeeCost,
  });
  const stock = useQuery({
    queryKey: queryKeys.forecasts.stock(7, 30),
    queryFn: () => forecasts.stock({ lead_time: 7, cover_days: 30 }),
    enabled: canSeeStock,
  });
  const brief = useQuery({ queryKey: queryKeys.brief.detail, queryFn: briefService.getBrief });

  const metrics = dashboard?.metrics ?? {};
  const comparisonLabel = meta?.comparison?.label ?? '';
  const currency = meta?.currency ?? getMoneyDefaults().currency;
  const decimals = meta?.currency_decimals ?? getMoneyDefaults().decimals;
  const money = { currency, decimals };
  const firstLoad = isLoading && !dashboard;

  const periodIsEmpty = Number(metrics.orders_count?.value ?? 0) === 0;
  const latestActivityOn = meta?.latest_activity_on ?? null;
  const tradedElsewhere =
    periodIsEmpty && latestActivityOn !== null && !withinPeriod(latestActivityOn, meta?.period);

  /*
   * One entrance for the cards below the band: a short rise, a small stagger,
   * no overshoot on data. useGsap skips it under reduced motion.
   */
  const scope = useGsap(
    (self) => {
      gsap.from(self.selector('[data-rise]'), {
        opacity: 0,
        y: 10,
        duration: 0.4,
        ease: 'power1.out',
        stagger: 0.05,
        clearProps: 'transform,opacity',
      });
    },
    [locale, Boolean(dashboard)],
  );

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

  const head = (
    <div className="flex flex-col gap-5">
      {wide && <TopBarPortal>{controls}</TopBarPortal>}

      <DashboardIntro channels={dashboard?.channels ?? []} />

      <DashboardHero
        metrics={metrics}
        trends={{
          revenue: dashboard?.revenue_trend,
          orders: dashboard?.orders_trend,
          aov: dashboard?.aov_trend,
        }}
        cash={cash.data?.data}
        canSeeCost={canSeeCost}
        {...money}
        comparisonLabel={comparisonLabel}
        loading={firstLoad}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 empty:hidden">
        {/*
          Held from the first frame, not dropped in when the figures arrive:
          appearing late it pushed every card below it down (a layout shift
          of 0.22). Before the server answers, the period chosen already says
          whether it runs up to today: every preset but a custom range does.
        */}
        <div className={meta ? undefined : 'invisible'}>
          <PeriodStatus
            show={meta ? meta.period?.is_partial : filters.preset !== 'custom'}
            againstComplete={meta?.comparison?.compares_partial_against_complete ?? true}
          />
        </div>
        <SeasonNotice meta={meta} onUseHijri={(comparison) => setFilters({ comparison })} />
        {!wide && controls}
      </div>
    </div>
  );

  if (isError) {
    return (
      <div className="flex flex-col gap-5" data-own-motion="">
        {head}
        <Card padded={false}>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  return (
    <div ref={scope} className="flex flex-col gap-5" data-own-motion="">
      {head}

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

      <div data-rise>
        <WeekActions
          insights={insights.insights}
          suppressed={insights.suppressed}
          loading={insights.isLoading}
          viewAllHref={can('analytics.view') ? '/analytics' : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <div data-rise className={canSeeCost ? 'min-w-0 lg:col-span-8' : 'min-w-0 lg:col-span-12'}>
          <DailyChart
            revenue={dashboard?.revenue_trend ?? []}
            netProfit={dashboard?.net_profit_trend}
            metrics={metrics}
            dailyAverage={dashboard?.daily_average}
            peak={dashboard?.peak}
            {...money}
            preset={filters.preset}
            onPresetChange={(preset) =>
              changePeriod({ preset, ...resolvePreset(preset), comparison: filters.comparison })
            }
            loading={isLoading}
            className="h-full"
          />
        </div>
        {canSeeCost && (
          <div data-rise className="min-w-0 lg:col-span-4">
            <ProfitBreakdown
              metrics={metrics}
              expenses={dashboard?.expenses_by_category}
              {...money}
              loading={isLoading}
              className="h-full"
            />
          </div>
        )}
      </div>

      <InView minHeight={420}>
        <div className="grid gap-4 lg:grid-cols-12">
          {canSeeCost && (
            <div data-rise className="min-w-0 lg:col-span-8">
              <CashOutlook
                data={cash.data?.data}
                {...money}
                loading={cash.isLoading}
                canEdit={can('settings.update')}
                className="h-full"
              />
            </div>
          )}
          <div
            data-rise
            className={canSeeCost ? 'min-w-0 lg:col-span-4' : 'min-w-0 lg:col-span-12'}
          >
            <ChannelMix
              channels={dashboard?.channels ?? []}
              canSeeCost={canSeeCost}
              {...money}
              loading={isLoading}
              className="h-full"
            />
          </div>
        </div>
      </InView>

      <div className="grid gap-4 lg:grid-cols-12">
        {canSeeStock && (
          <div data-rise className="min-w-0 lg:col-span-8">
            <StockRunway data={stock.data?.data} loading={stock.isLoading} className="h-full" />
          </div>
        )}
        <div
          data-rise
          className={
            canSeeStock
              ? 'flex min-w-0 flex-col gap-4 lg:col-span-4'
              : 'grid min-w-0 gap-4 lg:col-span-12 lg:grid-cols-2'
          }
        >
          {can('analytics.view') && <AskCard canSeeCost={canSeeCost} />}
          <ReadyCard brief={brief.data?.data} canSeeCost={canSeeCost} />
        </div>
      </div>

      <footer className="flex flex-wrap justify-between gap-2 pt-1 text-[0.6875rem] text-(--color-text-2)">
        {user?.business?.name && (
          <span>{t('dashboard.home.footer.isolated', { company: user.business.name })}</span>
        )}
        {user?.role && (
          <span>{t('dashboard.home.footer.role', { role: t(`roles.${user.role}`) })}</span>
        )}
      </footer>
    </div>
  );
}
