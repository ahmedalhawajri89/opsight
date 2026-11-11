'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  LabelList,
  Line,
  ReferenceArea,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_TYPE, ChartFrame } from './ChartFrame';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useId } from 'react';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { sumAmounts } from '@/lib/decimal';
import {
  formatCompact,
  formatMoney,
  formatNumber,
  formatPercent,
  getMoneyDefaults,
} from '@/lib/format';
import { formatBucketLabel, weekendRuns } from '@/lib/periods';

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
  currency = getMoneyDefaults().currency,
  decimals = 3,
  loading = false,
  error = null,
  onRetry,
  colour = 'var(--chart-1)',
  height = 260,
  weekendDays = [],
  icon,
  bare = false,
  summary = false,
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

  /*
   * Which bucket carries the end marker: the last COMPLETE one.
   *
   * The obvious choice is the last bucket, and it is wrong here. The final
   * bucket of a live period is usually still filling — the chart shades it
   * and says underneath that it "will keep rising" — so putting the series'
   * one prominent figure on it states a number the chart's own footnote
   * contradicts two lines later. A partial week showing 1.5k is not where
   * the business is; it is Monday.
   *
   * -1 when there is nothing to mark: a single bucket has no "end" worth
   * pointing at, and an all-partial series has no complete one.
   */
  const endIndex = series.length > 1 ? series.findLastIndex((bucket) => !bucket.is_partial) : -1;

  // Daily series only: the business's days off, shaded so a quiet Friday
  // reads as a weekend rather than as a drop (ADR-020).
  const weekends = weekendRuns(series, weekendDays);

  const stats = summary ? summarise(series, format) : null;

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
      bare={bare}
      className={className}
      style={style}
      emptyDescription={t('charts.trendEmpty')}
      legend={stats ? <TrendSummary stats={stats} formatValue={formatValue} /> : undefined}
      footnote={
        [partial && t('charts.partialFootnote'), weekends.length > 0 && t('charts.weekendFootnote')]
          .filter(Boolean)
          .join(' ') || undefined
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={series} margin={{ top: 20, right: 8, bottom: 0, left: 8 }}>
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
            tick={CHART_TYPE.tick}
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
            tick={CHART_TYPE.tick}
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

          {weekends.map(([from, to]) => (
            <ReferenceArea
              key={`weekend-${series[from].bucket}`}
              x1={series[from].label}
              x2={series[to].label}
              fill="var(--text-2)"
              fillOpacity={0.07}
              ifOverflow="extendDomain"
            />
          ))}

          {/* The partial bucket, shaded rather than silently drawn as a cliff. */}
          {partial && (
            <ReferenceArea
              // From the bucket before it: a band from one point to itself has
              // no width, and the partial bucket never showed at all.
              x1={series[Math.max(0, series.indexOf(partial) - 1)].label}
              x2={partial.label}
              fill="var(--warning)"
              fillOpacity={0.12}
              ifOverflow="extendDomain"
            />
          )}

          {/* The peak, marked where it happened, so the summary's "highest" has a place. */}
          {stats?.peak ? (
            <ReferenceDot
              x={stats.peak.label}
              y={Number(stats.peak.value)}
              r={4}
              fill="var(--surface)"
              stroke={colour}
              strokeWidth={2}
              ifOverflow="extendDomain"
            />
          ) : null}

          <Area
            type="monotone"
            dataKey="value"
            stroke={colour}
            strokeWidth={2.25}
            fill={`url(#${gradientId})`}
            isAnimationActive={!reducedMotion}
            animationDuration={800}
            animationEasing="ease-out"
            /*
             * A point only on the LAST bucket, and only when there is more
             * than one. A dot on every bucket turns a line into a necklace
             * and says nothing — the line already carries every value. The
             * end is different: it is the last figure the period actually
             * closed on, and it is what a reader looks for before they look
             * at the shape. "Lines carry their value at the end" is the mark
             * spec's own rule and this chart was not following it.
             *
             * The ring is the surface colour, so the point reads as sitting
             * on the chart rather than punched through it.
             */
            dot={(props) =>
              props.index === endIndex ? (
                <circle
                  key={props.index}
                  cx={props.cx}
                  cy={props.cy}
                  r={4}
                  fill={colour}
                  stroke="var(--surface)"
                  strokeWidth={2}
                />
              ) : (
                <g key={props.index} />
              )
            }
            activeDot={{ r: 5, strokeWidth: 2.5, stroke: 'var(--surface)', fill: colour }}
          >
            {/*
              And its value beside it. The axis gives an order of magnitude;
              this gives the number, which is what the reader came for and
              what they otherwise had to hover to see.
            */}
            <LabelList
              dataKey="value"
              content={({ x, y, value, index }) =>
                index === endIndex ? (
                  <text
                    x={x}
                    y={y - 12}
                    textAnchor={rtl ? 'start' : 'end'}
                    className="tabular"
                    fill={CHART_TYPE.label.fill}
                    fontSize={CHART_TYPE.label.fontSize}
                    fontWeight="500"
                  >
                    {formatAxis(value)}
                  </text>
                ) : null
              }
            />
          </Area>
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/**
 * A comparison line, drawn muted and dashed behind the primary series.
 *
 * **Not used anywhere, and cannot be until the API changes.** It needs a
 * `previous` value on each bucket; every trend payload carries only
 * `{ bucket, bucket_end, label, value, is_partial }`, and the comparison
 * exists solely as the scalars in `metrics[*].previous` and `change_pct`.
 *
 * Kept rather than deleted because UI_UX_DIRECTION.md §6 requires this line
 * and this is the shape it will take; what is missing is the data. Drop it if
 * the requirement is dropped.
 */
export function ComparisonLine({ dataKey = 'previous' }) {
  return (
    <Line
      type="monotone"
      dataKey={dataKey}
      stroke="var(--muted)"
      strokeWidth={1.5}
      strokeDasharray="4 3"
      dot={false}
      isAnimationActive={false}
    />
  );
}

/**
 * What the line says, in figures: the total, the average bucket, the best
 * and the worst, and how the latest finished bucket moved.
 *
 * Opt-in (`summary`), because only additive metrics have a meaningful total
 * — the analytics screen offers nothing else, the KPI panel's expanded
 * charts include ratios and do not ask for it.
 *
 * The bucket still filling is in the total (it is money already earned) but
 * not in "highest", "lowest" or "latest change": a Monday is not a week.
 */
function summarise(series, format) {
  const values = series.map((bucket) => bucket.value).filter((v) => v !== null && v !== undefined);

  if (values.length === 0) return null;

  const total =
    format === 'money' ? sumAmounts(values) : String(values.reduce((sum, v) => sum + Number(v), 0));
  const complete = series.filter(
    (bucket) => !bucket.is_partial && bucket.value !== null && bucket.value !== undefined,
  );
  const byValue = [...complete].sort((a, b) => Number(b.value) - Number(a.value));
  const last = complete.at(-1);
  const previous = complete.at(-2);

  return {
    total,
    average: Number(total) / values.length,
    peak: byValue[0] ?? null,
    low: byValue.length > 1 ? byValue.at(-1) : null,
    change:
      last && previous && Number(previous.value) > 0
        ? {
            ratio: (Number(last.value) - Number(previous.value)) / Number(previous.value),
            label: last.label,
          }
        : null,
  };
}

function TrendSummary({ stats, formatValue }) {
  const { t } = useI18n();
  const up = stats.change && stats.change.ratio >= 0;

  const items = [
    [t('charts.summary.total'), formatValue(stats.total), null],
    [t('charts.summary.average'), formatValue(stats.average), null],
    stats.peak ? [t('charts.summary.peak'), formatValue(stats.peak.value), stats.peak.label] : null,
    stats.low ? [t('charts.summary.low'), formatValue(stats.low.value), stats.low.label] : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-wrap items-end gap-x-8 gap-y-3 pb-2">
      {items.map(([label, value, when]) => (
        <div key={label} className="min-w-0">
          <p className="text-xs text-(--color-text-2)">{label}</p>
          <p className="tabular mt-1 text-lg font-semibold text-(--color-text)">{value}</p>
          {when ? <p className="text-xs text-(--color-muted)">{when}</p> : null}
        </div>
      ))}
      {stats.change ? (
        <p
          className={`mb-1 rounded-full px-2.5 py-1 text-xs font-medium ${
            up
              ? 'bg-(--color-success-soft) text-(--color-success)'
              : 'bg-(--color-danger-soft) text-(--color-danger)'
          }`}
        >
          {t(up ? 'charts.summary.up' : 'charts.summary.down', {
            change: formatPercent(Math.abs(stats.change.ratio)),
            label: stats.change.label,
          })}
        </p>
      ) : null}
    </div>
  );
}
