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

import { CHART_TYPE, ChartFrame } from './ChartFrame';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatMoney, formatMoneyCompact } from '@/lib/format';
import { describePeriod, formatBucketLabel, formatMonthLabel } from '@/lib/periods';

/**
 * "Business performance": net revenue against operating expenses, month by
 * month over the last six months.
 *
 * Two series the server sends separately, joined here by bucket date — a join,
 * not a calculation: no difference or margin is derived on the client. The
 * current month is drawn at reduced strength and footnoted, because an
 * unfinished month set beside five finished ones reads as a collapse.
 */
/*
 * TWO HUES, and they used to be one.
 *
 * Both series were `--chart-1` and told apart by opacity alone — revenue at
 * 1, expenses at 0.35 — while the unfinished month ALSO used opacity,
 * multiplying whichever series it belonged to by 0.5. One channel carrying
 * two variables: revenue in the current month landed at 0.5 and expenses in
 * any month at 0.35, which no reader can separate, and the two mean
 * completely different things.
 *
 * Hue says WHICH SERIES now and opacity says WHETHER THE MONTH IS DONE, so
 * each channel carries one fact. The pair is validated: contrast.test.js
 * holds every pair of the six chart colours at delta-E 15 or better under
 * normal, protanopic and deuteranopic vision.
 */
const REVENUE = 'var(--chart-1)';
const EXPENSES = 'var(--chart-2)';

/** Complete, and still filling. The only thing opacity means here. */
const SOLID = 1;
const UNFINISHED = 0.45;

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
      /*
       * Which six months, in words. The series is a trailing window the
       * server chooses and states in `data.period` — NOT the period the rest
       * of the dashboard is showing — and a reader comparing this panel with
       * the figures above it has no way to know that unless it is written.
       */
      description={data?.period ? describePeriod(data.period.from, data.period.to) : undefined}
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
          {/* Solid, horizontal, at the lightest token. Dashing a gridline adds
              noise and reads as a second data line. */}
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="0" />

          <XAxis
            dataKey="month"
            reversed={rtl}
            tick={CHART_TYPE.tick}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
          />

          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tickFormatter={(value) => formatMoneyCompact(value, { currency })}
            tick={CHART_TYPE.tick}
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
            Revenue first, always, so position reinforces the hue — and the
            legend and the table view carry the names, so neither series is
            ever identified by colour alone (UI_UX_DIRECTION.md §4).
          */}
          {[
            ['revenueNumeric', REVENUE],
            ['expensesNumeric', EXPENSES],
          ].map(([key, colour]) => (
            <Bar
              key={key}
              dataKey={key}
              fill={colour}
              radius={[4, 4, 0, 0]}
              maxBarSize={26}
              isAnimationActive={!reducedMotion}
              animationDuration={700}
            >
              {rows.map((row) => (
                <Cell key={row.key} fillOpacity={row.is_partial ? UNFINISHED : SOLID} />
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
        [REVENUE, t('dashboard.trend.revenue')],
        [EXPENSES, t('dashboard.trend.expenses')],
      ].map(([colour, label]) => (
        <li key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2.5 rounded-full"
            style={{ background: colour }}
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
