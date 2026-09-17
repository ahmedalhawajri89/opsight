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
import { formatMoney, formatMoneyCompact, formatNumber, formatPercent } from '@/lib/format';

/**
 * A metric grouped by a dimension, drawn as a horizontal bar ranking.
 *
 * Horizontal rather than vertical because the labels are product and customer
 * names: rotated vertical labels are unreadable at any useful density.
 *
 * Two rules:
 *  - Bars start at zero. A truncated baseline makes a 5% difference look like
 *    a 50% one, which is the classic way a bar chart lies.
 *  - The "Other" row the API supplies is drawn in a neutral tone and kept, so
 *    the visible shares still sum to the whole.
 */
export function BreakdownChart({
  title,
  description,
  rows = [],
  format = 'money',
  currency = 'BHD',
  decimals = 3,
  loading = false,
  error = null,
  onRetry,
  height = 320,
  className,
}) {
  const formatValue = (value) =>
    format === 'money' ? formatMoney(value, { currency, decimals }) : formatNumber(value);

  const columns = [
    { key: 'label', header: 'Name' },
    { key: 'value', header: title, numeric: true, cell: (row) => formatValue(row.value) },
    {
      key: 'share',
      header: 'Share',
      numeric: true,
      // A share of a zero total is undefined, not zero.
      cell: (row) => formatPercent(row.share),
    },
  ];

  const data = rows.map((row) => ({ ...row, numeric: Number(row.value) }));

  return (
    <ChartFrame
      title={title}
      description={description}
      columns={columns}
      rows={rows}
      loading={loading}
      error={error}
      onRetry={onRetry}
      height={height}
      className={className}
      emptyDescription="Nothing was sold in this period, so there is nothing to rank."
      footnote={
        rows.some((row) => row.is_other)
          ? 'Everything outside the top rows is grouped as Other, so the shares still sum to the whole.'
          : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />

          {/* Baseline at zero, always. */}
          <XAxis
            type="number"
            domain={[0, 'auto']}
            tickFormatter={(value) =>
              format === 'money' ? formatMoneyCompact(value, { currency }) : formatNumber(value)
            }
            tick={{ fill: 'var(--text-subtle)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />

          <YAxis
            type="category"
            dataKey="label"
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={140}
          />

          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;

              const row = payload[0].payload;

              return (
                <div className="rounded-(--radius-sm) border border-(--color-line) bg-(--color-surface-raised) px-2.5 py-2 text-[0.8125rem] shadow-(--shadow-overlay)">
                  <p className="font-medium text-(--color-text)">{row.label}</p>
                  {row.sublabel && <p className="text-(--color-text-subtle)">{row.sublabel}</p>}
                  <p className="tabular text-(--color-text)">{formatValue(row.value)}</p>
                  <p className="tabular text-(--color-text-muted)">
                    {formatPercent(row.share)} of the period
                  </p>
                </div>
              );
            }}
          />

          <Bar dataKey="numeric" isAnimationActive={false} radius={[0, 2, 2, 0]}>
            {data.map((row) => (
              <Cell
                key={row.key}
                // "Other" is deliberately neutral: it is an aggregate, not a
                // competitor in the ranking.
                fill={row.is_other ? 'var(--series-6)' : 'var(--series-2)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
