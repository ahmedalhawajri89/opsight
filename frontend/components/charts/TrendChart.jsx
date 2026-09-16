'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartFrame } from './ChartFrame';
import { formatMoney, formatMoneyCompact, formatNumber } from '@/lib/format';

/**
 * A metric over time.
 *
 * THE ONLY DIRECTORY PERMITTED TO IMPORT RECHARTS, so the library stays
 * replaceable in one place (FRONTEND_ARCHITECTURE.md §9).
 *
 * Rules this component enforces so the chart cannot mislead:
 *
 *  - It renders the API's series DIRECTLY. No client-side arithmetic — a chart
 *    that computes its own percentages is a second metric definition.
 *  - Zero buckets are drawn, not dropped. The API already emits them; dropping
 *    them here would reintroduce the lie about slope.
 *  - The partial final bucket is SHADED and annotated, so an unfinished month
 *    does not read as a collapse.
 *  - No gradient fill, no 3D, no entry animation.
 */
export function TrendChart({
  title,
  description,
  series = [],
  format = 'money',
  currency = 'BHD',
  decimals = 3,
  loading = false,
  error = null,
  onRetry,
  colour = 'var(--series-2)',
  height = 280,
  className,
}) {
  const formatValue = (value) =>
    format === 'money' ? formatMoney(value, { currency, decimals }) : formatNumber(value);

  const formatAxis = (value) =>
    format === 'money' ? formatMoneyCompact(value, { currency }) : formatNumber(value);

  const partial = series.find((bucket) => bucket.is_partial);

  const columns = [
    { key: 'label', header: 'Period' },
    {
      key: 'value',
      header: title,
      numeric: true,
      cell: (row) => formatValue(row.value),
    },
    {
      key: 'is_partial',
      header: 'Complete',
      cell: (row) => (row.is_partial ? 'In progress' : 'Yes'),
    },
  ];

  return (
    <ChartFrame
      title={title}
      description={description}
      columns={columns}
      rows={series}
      loading={loading}
      error={error}
      onRetry={onRetry}
      height={height}
      className={className}
      emptyDescription="Nothing was sold in this period, so there is no trend to draw."
      footnote={
        partial ? 'The shaded final period is still in progress and will keep rising.' : undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          {/* Horizontal gridlines only, at the lightest border token. */}
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />

          <XAxis
            dataKey="label"
            tick={{ fill: 'var(--text-subtle)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            minTickGap={24}
          />

          {/*
            Baseline at zero. An area chart that starts elsewhere exaggerates
            every movement on it.
          */}
          <YAxis
            tickFormatter={formatAxis}
            tick={{ fill: 'var(--text-subtle)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={72}
            domain={[0, 'auto']}
          />

          <Tooltip
            cursor={{ stroke: 'var(--border-strong)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;

              const point = payload[0].payload;

              return (
                <div className="rounded-[--radius-sm] border border-[--color-line] bg-[--color-surface-raised] px-2.5 py-2 text-[0.8125rem] shadow-[--shadow-overlay]">
                  <p className="text-[--color-text-muted]">{point.label}</p>
                  <p className="tabular font-medium text-[--color-text]">
                    {formatValue(point.value)}
                  </p>
                  {point.is_partial && (
                    <p className="mt-1 text-[--color-warning]">Still in progress</p>
                  )}
                </div>
              );
            }}
          />

          {/* The partial bucket, shaded rather than silently drawn as a cliff. */}
          {partial && (
            <ReferenceArea
              x1={partial.label}
              x2={partial.label}
              fill="var(--warning)"
              fillOpacity={0.12}
              ifOverflow="extendDomain"
            />
          )}

          <Area
            type="monotone"
            dataKey="value"
            stroke={colour}
            strokeWidth={2}
            fill={colour}
            // A flat wash, not a gradient — decoration competing with data.
            fillOpacity={0.08}
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** A comparison line, drawn muted and dashed behind the primary series. */
export function ComparisonLine({ dataKey = 'previous' }) {
  return (
    <Line
      type="monotone"
      dataKey={dataKey}
      stroke="var(--text-subtle)"
      strokeWidth={1.5}
      strokeDasharray="4 3"
      dot={false}
      isAnimationActive={false}
    />
  );
}
