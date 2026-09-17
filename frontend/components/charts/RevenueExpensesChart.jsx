'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartFrame } from './ChartFrame';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { formatBucketLabel } from '@/lib/periods';

/**
 * Net revenue and operating expenses over the selected period, as two lines.
 *
 * The two series arrive separately and are joined here by bucket date — a join,
 * not a calculation. A role that may not see cost receives no expense series at
 * all, and the chart becomes a revenue trend rather than showing an empty line
 * that implies expenses were zero.
 *
 * The range switch beneath the title changes the DASHBOARD's period, not just
 * this chart: a chart on a different window from the cards above it would
 * contradict them.
 */
const REVENUE = 'var(--series-1)';
const EXPENSES = 'var(--series-2)';

export const QUICK_RANGES = [
  { preset: '7d', count: 7, unit: 'days' },
  { preset: '30d', count: 30, unit: 'days' },
  { preset: '90d', count: 90, unit: 'days' },
  { preset: '365d', count: 1, unit: 'years' },
];

export function RevenueExpensesChart({
  revenue = [],
  expenses,
  currency,
  decimals,
  preset,
  onPresetChange,
  loading,
  className,
  style,
}) {
  const { t, dir } = useI18n();
  const rtl = dir === 'rtl';
  const reducedMotion = useReducedMotion();
  const gradient = useId().replaceAll(':', '');
  const withExpenses = Array.isArray(expenses);

  const expensesByBucket = new Map((expenses ?? []).map((bucket) => [bucket.bucket, bucket]));

  const rows = revenue.map((bucket) => ({
    key: bucket.bucket,
    label: formatBucketLabel(bucket.bucket, bucket.bucket_end),
    revenue: bucket.value,
    expenses: expensesByBucket.get(bucket.bucket)?.value ?? null,
    revenueNumeric: Number(bucket.value) || 0,
    expensesNumeric: Number(expensesByBucket.get(bucket.bucket)?.value) || 0,
    is_partial: bucket.is_partial,
  }));

  const money = (value) => formatMoney(value, { currency, decimals });

  const columns = [
    { key: 'label', header: t('charts.period') },
    {
      key: 'revenue',
      header: t('dashboard.trend.revenue'),
      numeric: true,
      cell: (row) => money(row.revenue),
    },
    ...(withExpenses
      ? [
          {
            key: 'expenses',
            header: t('dashboard.trend.expenses'),
            numeric: true,
            cell: (row) => money(row.expenses),
          },
        ]
      : []),
  ];

  return (
    <ChartFrame
      title={withExpenses ? t('dashboard.trend.title') : t('dashboard.trend.titleRevenueOnly')}
      description={
        withExpenses
          ? t('dashboard.trend.description')
          : t('dashboard.trend.descriptionRevenueOnly')
      }
      icon="diamond"
      columns={columns}
      rows={rows}
      loading={loading}
      emptyDescription={t('charts.trendEmpty')}
      actions={
        onPresetChange && (
          <div
            role="group"
            aria-label={t('dashboard.trend.rangeLabel')}
            className="flex items-center gap-1 rounded-(--radius-md) border border-(--color-line) bg-(--color-surface) p-0.5"
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
                  'tabular h-7 min-w-10 rounded-(--radius-sm) px-2.5 text-xs font-semibold transition-colors',
                  preset === range.preset
                    ? 'bg-(--color-accent) text-(--color-text-inverse)'
                    : 'text-(--color-text-muted) hover:bg-(--color-surface-hover) hover:text-(--color-text)',
                )}
              >
                {t(`dashboard.trend.range.${range.unit}`, { count: range.count })}
              </button>
            ))}
          </div>
        )
      }
      legend={
        <ul className="flex items-center gap-5 text-xs text-(--color-text-muted)">
          <LegendItem colour={REVENUE} label={t('dashboard.trend.revenue')} />
          {withExpenses && <LegendItem colour={EXPENSES} label={t('dashboard.trend.expenses')} />}
        </ul>
      }
      height={230}
      className={className}
      style={style}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 10, right: 6, bottom: 0, left: 6 }}>
          <defs>
            <linearGradient id={`${gradient}-r`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={REVENUE} stopOpacity={0.22} />
              <stop offset="100%" stopColor={REVENUE} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={`${gradient}-e`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={EXPENSES} stopOpacity={0.14} />
              <stop offset="100%" stopColor={EXPENSES} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} stroke="var(--border-subtle)" />

          <XAxis
            dataKey="label"
            reversed={rtl}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            minTickGap={32}
          />

          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tickFormatter={(value) => formatMoneyCompact(value, { currency })}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={68}
            domain={[0, 'auto']}
          />

          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;

              const row = payload[0].payload;

              return (
                <div
                  dir={dir}
                  className="min-w-44 rounded-(--radius-md) border border-(--color-line) bg-(--color-surface-raised) px-3 py-2.5 text-xs shadow-(--shadow-overlay)"
                >
                  <p className="font-medium text-(--color-text-muted)">{row.label}</p>
                  <TooltipRow
                    colour={REVENUE}
                    label={t('dashboard.trend.revenue')}
                    value={money(row.revenue)}
                  />
                  {withExpenses && (
                    <TooltipRow
                      colour={EXPENSES}
                      label={t('dashboard.trend.expenses')}
                      value={money(row.expenses)}
                    />
                  )}
                  {row.is_partial && (
                    <p className="mt-1.5 text-(--color-warning)">{t('charts.stillInProgress')}</p>
                  )}
                </div>
              );
            }}
          />

          {withExpenses && (
            <Area
              type="monotone"
              dataKey="expensesNumeric"
              stroke={EXPENSES}
              strokeWidth={2}
              fill={`url(#${gradient}-e)`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: EXPENSES }}
              isAnimationActive={!reducedMotion}
              animationDuration={800}
            />
          )}

          <Area
            type="monotone"
            dataKey="revenueNumeric"
            stroke={REVENUE}
            strokeWidth={2.25}
            fill={`url(#${gradient}-r)`}
            dot={rows.length <= 40 ? { r: 2.5, strokeWidth: 0, fill: REVENUE } : false}
            activeDot={{ r: 5, strokeWidth: 2.5, stroke: 'var(--surface)', fill: REVENUE }}
            isAnimationActive={!reducedMotion}
            animationDuration={800}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function LegendItem({ colour, label }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: colour }} />
      {label}
    </li>
  );
}

function TooltipRow({ colour, label, value }) {
  return (
    <p className="mt-1.5 flex items-center gap-2">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: colour }} />
      <span className="flex-1 text-(--color-text-muted)">{label}</span>
      <span className="tabular font-semibold text-(--color-text)">{value}</span>
    </p>
  );
}
