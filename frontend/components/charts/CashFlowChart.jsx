'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartFrame } from './ChartFrame';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { formatBucketLabel, formatMonthLabel } from '@/lib/periods';

/**
 * "Business performance": net revenue against operating expenses, month by
 * month over the last six months.
 *
 * Two series the server sends separately, joined here by bucket date — a join,
 * not a calculation: no difference or margin is derived on the client. The
 * current month is drawn lighter and footnoted, because an unfinished month set
 * beside five finished ones reads as a collapse.
 */
const REVENUE = 'var(--chart-1)';
const EXPENSES = 'var(--chart-1)';

export function CashFlowChart({ data, currency, decimals, loading, className, style }) {
  const { t, dir } = useI18n();
  const rtl = dir === 'rtl';
  const reducedMotion = useReducedMotion();

  const expensesByBucket = new Map((data?.expenses ?? []).map((bucket) => [bucket.bucket, bucket]));

  const rows = (data?.revenue ?? []).map((bucket) => ({
    key: bucket.bucket,
    month: formatMonthLabel(bucket.bucket),
    label: formatBucketLabel(bucket.bucket, bucket.bucket_end),
    revenue: bucket.value,
    expenses: expensesByBucket.get(bucket.bucket)?.value ?? null,
    revenueNumeric: Number(bucket.value) || 0,
    expensesNumeric: Number(expensesByBucket.get(bucket.bucket)?.value) || 0,
    is_partial: bucket.is_partial,
  }));

  const hasData = rows.some((row) => row.revenueNumeric !== 0 || row.expensesNumeric !== 0);
  const partial = rows.some((row) => row.is_partial);
  const money = (value) => formatMoney(value, { currency, decimals });

  const columns = [
    { key: 'label', header: t('dashboard.cashFlow.month') },
    {
      key: 'revenue',
      header: t('dashboard.trend.revenue'),
      numeric: true,
      cell: (row) => money(row.revenue),
    },
    {
      key: 'expenses',
      header: t('dashboard.trend.expenses'),
      numeric: true,
      cell: (row) => money(row.expenses),
    },
  ];

  return (
    <ChartFrame
      title={t('dashboard.cashFlow.title')}
      icon="trendUp"
      columns={columns}
      rows={hasData ? rows : []}
      loading={loading}
      emptyDescription={t('charts.noData')}
      footnote={partial ? t('dashboard.cashFlow.partialFootnote') : undefined}
      actions={<Legend />}
      height={180}
      className={className}
      style={style}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          barGap={6}
          barCategoryGap="22%"
          margin={{ top: 6, right: 4, bottom: 0, left: 4 }}
        >
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />

          <XAxis
            dataKey="month"
            reversed={rtl}
            tick={{ fill: 'var(--text-2)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />

          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tickFormatter={(value) => formatMoneyCompact(value, { currency })}
            tick={{ fill: 'var(--text-2)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={62}
            domain={[0, 'auto']}
          />

          <Tooltip
            cursor={{ fill: 'var(--surface-hover)', radius: 6 }}
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
                    opacity={1}
                    label={t('dashboard.trend.revenue')}
                    value={money(row.revenue)}
                  />
                  <TooltipRow
                    colour={EXPENSES}
                    opacity={0.35}
                    label={t('dashboard.trend.expenses')}
                    value={money(row.expenses)}
                  />
                  {row.is_partial && (
                    <p className="mt-1.5 text-(--color-warning)">{t('charts.stillInProgress')}</p>
                  )}
                </div>
              );
            }}
          />

          {/*
            Revenue solid, expenses the same blue at a third strength — the
            reference's pairing. The two are also told apart by position (always
            revenue first) and by the legend and table, never by shade alone.
          */}
          {[
            ['revenueNumeric', 1],
            ['expensesNumeric', 0.35],
          ].map(([key, opacity]) => (
            <Bar
              key={key}
              dataKey={key}
              fill={REVENUE}
              fillOpacity={opacity}
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
              isAnimationActive={!reducedMotion}
              animationDuration={700}
            >
              {rows.map((row) => (
                <Cell key={row.key} fillOpacity={row.is_partial ? opacity * 0.5 : opacity} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

function Legend() {
  const { t } = useI18n();

  return (
    <ul className="flex items-center gap-4 text-xs text-(--color-text-2)">
      {[
        [1, t('dashboard.trend.revenue')],
        [0.35, t('dashboard.trend.expenses')],
      ].map(([opacity, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ background: REVENUE, opacity }}
          />
          {label}
        </li>
      ))}
    </ul>
  );
}

function TooltipRow({ colour, opacity, label, value }) {
  return (
    <p className="mt-1.5 flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2 rounded-full"
        style={{ background: colour, opacity }}
      />
      <span className="flex-1 text-(--color-text-2)">{label}</span>
      <span className="tabular font-semibold text-(--color-text)">{value}</span>
    </p>
  );
}
