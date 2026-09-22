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
  const { t, dir } = useI18n();
  const rtl = dir === 'rtl';

  const formatValue = (value) =>
    format === 'money' ? formatMoney(value, { currency, decimals }) : formatNumber(value);

  const columns = [
    { key: 'label', header: t('charts.name') },
    { key: 'value', header: title, numeric: true, cell: (row) => formatValue(row.value) },
    {
      key: 'share',
      header: t('charts.share'),
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
      emptyDescription={t('charts.rankEmpty')}
      footnote={rows.some((row) => row.is_other) ? t('charts.otherFootnote') : undefined}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />

          {/* Baseline at zero, always. */}
          {/* Bars grow away from the reading start: from the right in Arabic. */}
          <XAxis
            type="number"
            reversed={rtl}
            domain={[0, 'auto']}
            tickFormatter={(value) =>
              format === 'money' ? formatMoneyCompact(value, { currency }) : formatNumber(value)
            }
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
          />

          <YAxis
            type="category"
            orientation={rtl ? 'right' : 'left'}
            dataKey="label"
            tick={{ fill: 'var(--text-2)', fontSize: 11 }}
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
                <div
                  dir={dir}
                  className="rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-2.5 py-2 text-sm shadow-(--shadow-overlay)"
                >
                  <p className="font-medium text-(--color-text)">{row.label}</p>
                  {row.sublabel && <p className="text-(--color-muted)">{row.sublabel}</p>}
                  <p className="tabular text-(--color-text)">{formatValue(row.value)}</p>
                  <p className="tabular text-(--color-text-2)">
                    {t('charts.shareOfPeriod', { share: formatPercent(row.share) })}
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
                fill={row.is_other ? 'var(--chart-6)' : 'var(--chart-1)'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
