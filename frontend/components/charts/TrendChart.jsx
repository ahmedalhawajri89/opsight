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
import { useI18n } from '@/features/i18n/I18nProvider';
import { useId } from 'react';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatCompact, formatMoney, formatNumber } from '@/lib/format';
import { formatBucketLabel } from '@/lib/periods';

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
 *  - No 3D and no looping motion. The area fades from the line to nothing, so
 *    the fill reads as "under this line" rather than as a second shape, and
 *    the line draws in once, briefly, unless the reader has asked for less
 *    motion.
 *  - Axis ticks are bare compact numbers; the currency is stated once, in the
 *    description, instead of on every tick where it only adds noise.
 */
export function TrendChart({
  title,
  description,
  series: rawSeries = [],
  format = 'money',
  currency = 'BHD',
  decimals = 3,
  loading = false,
  error = null,
  onRetry,
  colour = 'var(--chart-1)',
  height = 260,
  icon,
  className,
  style,
}) {
  const { t, dir } = useI18n();
  const rtl = dir === 'rtl';
  const reducedMotion = useReducedMotion();
  const gradientId = useId().replaceAll(':', '');

  const formatValue = (value) =>
    format === 'money' ? formatMoney(value, { currency, decimals }) : formatNumber(value);

  const formatAxis = (value) => (format === 'money' ? formatCompact(value) : formatNumber(value));

  // Relabelled for the reader; the values are the API's, untouched.
  const series = rawSeries.map((bucket) => ({
    ...bucket,
    label: formatBucketLabel(bucket.bucket, bucket.bucket_end) || bucket.label,
  }));

  const partial = series.find((bucket) => bucket.is_partial);

  const columns = [
    { key: 'label', header: t('charts.period') },
    {
      key: 'value',
      header: title,
      numeric: true,
      cell: (row) => formatValue(row.value),
    },
    {
      key: 'is_partial',
      header: t('charts.complete'),
      cell: (row) => (row.is_partial ? t('charts.inProgress') : t('common.yes')),
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
      icon={icon}
      className={className}
      style={style}
      emptyDescription={t('charts.trendEmpty')}
      footnote={partial ? t('charts.partialFootnote') : undefined}
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colour} stopOpacity={0.22} />
              <stop offset="100%" stopColor={colour} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* Horizontal gridlines only, at the lightest border token. */}
          <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="0" />

          {/*
            Time runs in the reading direction. In Arabic the earliest period
            is on the right and the value axis sits on the right edge, so the
            chart reads the same way as the sentence above it.
          */}
          <XAxis
            dataKey="label"
            reversed={rtl}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            tickMargin={8}
            minTickGap={28}
          />

          {/*
            Baseline at zero. An area chart that starts elsewhere exaggerates
            every movement on it.
          */}
          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tickFormatter={formatAxis}
            tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={48}
            domain={[0, 'auto']}
          />

          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeDasharray: '3 3' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;

              const point = payload[0].payload;

              return (
                <div
                  dir={dir}
                  className="rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm shadow-(--shadow-overlay)"
                >
                  <p className="text-xs text-(--color-text-2)">{point.label}</p>
                  <p className="tabular mt-0.5 font-semibold text-(--color-text)">
                    {formatValue(point.value)}
                  </p>
                  {point.is_partial && (
                    <p className="mt-1 text-(--color-warning)">{t('charts.stillInProgress')}</p>
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
            strokeWidth={2.25}
            fill={`url(#${gradientId})`}
            isAnimationActive={!reducedMotion}
            animationDuration={800}
            animationEasing="ease-out"
            dot={false}
            activeDot={{ r: 5, strokeWidth: 2.5, stroke: 'var(--surface)', fill: colour }}
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
