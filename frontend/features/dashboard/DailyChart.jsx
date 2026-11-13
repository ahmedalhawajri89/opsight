'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { CHART_TYPE, ChartFrame } from '@/components/charts/ChartFrame';
import { QUICK_RANGES } from '@/components/charts/RevenueExpensesChart';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { formatBucketLabel } from '@/lib/periods';

import { Amount } from './Amount';

const REVENUE = 'var(--chart-revenue)';
const PROFIT = 'var(--chart-profit)';

/**
 * Revenue and net profit, bucket by bucket, as one bar each: the slate bar is
 * the day's revenue and the gold bar in front of it is what stayed after cost
 * of goods and that day's expenses. A day that lost money shows its gold bar
 * below the line.
 *
 * Above the bars, four figures the server worked out: revenue and net profit
 * for the period, the average day, and the best day. A role without cost gets
 * revenue only: no profit bar, no profit figure.
 *
 * The two series are joined by bucket date; nothing is subtracted here.
 */
export function DailyChart({
  revenue = [],
  netProfit,
  metrics,
  dailyAverage,
  peak,
  currency,
  decimals,
  preset,
  onPresetChange,
  loading,
  className,
}) {
  const { t, dir } = useI18n();
  const rtl = dir === 'rtl';
  const reducedMotion = useReducedMotion();
  const withProfit = Array.isArray(netProfit);
  const money = (value) => formatMoney(value, { currency, decimals });
  const profitByBucket = new Map((netProfit ?? []).map((bucket) => [bucket.bucket, bucket.value]));

  const rows = revenue.map((bucket) => ({
    key: bucket.bucket,
    label: formatBucketLabel(bucket.bucket, bucket.bucket_end),
    revenue: bucket.value,
    profit: profitByBucket.get(bucket.bucket) ?? null,
    revenueNumeric: Number(bucket.value) || 0,
    profitNumeric: Number(profitByBucket.get(bucket.bucket)) || 0,
    is_partial: bucket.is_partial,
  }));

  const hasData = rows.some((row) => row.revenueNumeric !== 0 || row.profitNumeric !== 0);

  const columns = [
    { key: 'label', header: t('dashboard.home.daily.range') },
    {
      key: 'revenue',
      header: t('dashboard.home.daily.revenue'),
      numeric: true,
      cell: (row) => money(row.revenue),
    },
    ...(withProfit
      ? [
          {
            key: 'profit',
            header: t('dashboard.home.daily.netProfit'),
            numeric: true,
            cell: (row) => money(row.profit),
          },
        ]
      : []),
  ];

  const stats = [
    {
      key: 'revenue',
      label: t('dashboard.home.daily.revenue'),
      value: metrics?.net_revenue?.value,
      swatch: REVENUE,
    },
    withProfit && {
      key: 'profit',
      label: t('dashboard.home.daily.netProfit'),
      value: metrics?.net_profit?.value,
      swatch: PROFIT,
    },
    { key: 'average', label: t('dashboard.home.daily.average'), value: dailyAverage },
    {
      key: 'peak',
      label: t('dashboard.home.daily.peak'),
      value: peak?.value ?? null,
      note: peak ? formatBucketLabel(peak.bucket, peak.bucket_end) : null,
    },
  ].filter(Boolean);

  return (
    <ChartFrame
      title={
        withProfit ? t('dashboard.home.daily.title') : t('dashboard.home.daily.titleRevenueOnly')
      }
      description={
        withProfit
          ? t('dashboard.home.daily.subtitle')
          : t('dashboard.home.daily.subtitleRevenueOnly')
      }
      columns={columns}
      rows={hasData ? rows : []}
      loading={loading}
      emptyDescription={t('charts.trendEmpty')}
      actions={
        onPresetChange && (
          <div
            role="group"
            aria-label={t('dashboard.trend.rangeLabel')}
            className="flex items-center rounded-(--radius-control) bg-(--color-surface-hover) p-[3px]"
          >
            {QUICK_RANGES.map((range) => (
              <button
                key={range.preset}
                type="button"
                aria-pressed={preset === range.preset}
                title={t(`period.presets.${range.preset}`, {
                  count: range.preset === '365d' ? 12 : range.count,
                })}
                onClick={() => onPresetChange(range.preset)}
                className={cn(
                  'tabular h-8 min-w-11 rounded-(--radius-control) px-3 text-xs transition-colors',
                  preset === range.preset
                    ? 'bg-(--color-brand) font-semibold text-(--color-text-inverse)'
                    : 'text-(--color-text-2) hover:text-(--color-text)',
                )}
              >
                {t(`dashboard.trend.range.${range.unit}`, { count: range.count })}
              </button>
            ))}
          </div>
        )
      }
      legend={
        <dl className="mb-3 flex flex-wrap rounded-(--radius-panel) border border-(--color-line-subtle)">
          {stats.map((stat, index) => (
            <div
              key={stat.key}
              className={cn(
                'flex min-w-0 flex-[1_1_8.5rem] flex-col gap-0.5 px-4 py-3',
                index > 0 && 'border-s border-(--color-line-subtle)',
              )}
            >
              <dt className="flex items-center gap-1.5 text-xs text-(--color-text-2)">
                {stat.swatch && (
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-[2px]"
                    style={{ background: stat.swatch }}
                  />
                )}
                {stat.label}
              </dt>
              <dd className="flex flex-wrap items-baseline gap-x-1.5 text-lg font-bold text-(--color-text)">
                <Amount
                  value={stat.value}
                  currency={currency}
                  decimals={decimals}
                  currencyClassName="text-xs"
                />
                {stat.note && (
                  <span className="text-xs font-medium text-(--color-text-2)">{stat.note}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      }
      height={230}
      className={className}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          barGap="-100%"
          barCategoryGap="22%"
          margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 3" />
          <XAxis
            dataKey="label"
            reversed={rtl}
            tick={CHART_TYPE.tick}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickMargin={8}
            minTickGap={28}
          />
          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tickFormatter={(value) => formatMoneyCompact(value, { currency })}
            tick={CHART_TYPE.tick}
            tickLine={false}
            axisLine={false}
            width={76}
          />
          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;

              const row = payload[0].payload;

              return (
                <div
                  dir={dir}
                  className="min-w-44 rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-3 py-2.5 text-xs shadow-(--shadow-overlay)"
                >
                  <p className="font-medium text-(--color-text-2)">{row.label}</p>
                  <TooltipRow
                    colour={REVENUE}
                    label={t('dashboard.home.daily.revenue')}
                    value={money(row.revenue)}
                  />
                  {withProfit && (
                    <TooltipRow
                      colour={PROFIT}
                      label={t('dashboard.home.daily.netProfit')}
                      value={money(row.profit)}
                    />
                  )}
                  {row.is_partial && (
                    <p className="mt-1.5 text-(--color-warning)">{t('charts.stillInProgress')}</p>
                  )}
                </div>
              );
            }}
          />
          <Bar
            dataKey="revenueNumeric"
            fill={REVENUE}
            radius={[3, 3, 0, 0]}
            isAnimationActive={!reducedMotion}
            animationDuration={700}
          />
          {withProfit && (
            <Bar
              dataKey="profitNumeric"
              fill={PROFIT}
              radius={[3, 3, 0, 0]}
              isAnimationActive={!reducedMotion}
              animationDuration={900}
            />
          )}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function TooltipRow({ colour, label, value }) {
  return (
    <p className="mt-1.5 flex items-center gap-2">
      <span aria-hidden="true" className="size-2 rounded-[2px]" style={{ background: colour }} />
      <span className="flex-1 text-(--color-text-2)">{label}</span>
      <span className="tabular font-semibold text-(--color-text)">{value}</span>
    </p>
  );
}
