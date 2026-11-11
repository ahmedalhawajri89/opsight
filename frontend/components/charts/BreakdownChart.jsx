'use client';

import { ChartFrame } from './ChartFrame';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney, formatNumber, formatPercent, getMoneyDefaults } from '@/lib/format';

/**
 * A metric grouped by a dimension, as a ranked list (a leaderboard).
 *
 * IT USED TO BE A BAR CHART, and the owner looking at it named what was
 * wrong. Three things, each a consequence of drawing a ranking as an axis:
 *
 *  - "Other" aggregates everything past the top ten and was often the
 *    longest bar — 37% against a leader of 11% — so it set the scale, and
 *    the ten rows the chart existed to rank were squeezed into a third of
 *    the width where their lengths could not be told apart.
 *  - Product names ran onto two lines inside a fixed 140px label column,
 *    and a name mixing Arabic and Latin ("لابتوب ١٥ إنش Core i7 32GB") was
 *    reordered by the bidirectional algorithm into "32GBبذاكرة".
 *  - Each bar carried its share but never its amount, which lived only in
 *    a tooltip.
 *
 * So now: one row per item, rank, the whole name on one line, the amount
 * and the share as text, and a thin bar measured against THE LEADER rather
 * than against "Other". The bar answers "how close is this to the top?",
 * which is the question a ranking asks; the share answers "how much of the
 * whole?", in words. "Other" sits under a rule as a summary line with no
 * bar, because it is an aggregate, not a competitor.
 *
 * Bars still start at zero, so a row twice as long is twice as much.
 */
export function BreakdownChart({
  title,
  description,
  rows = [],
  format = 'money',
  currency = getMoneyDefaults().currency,
  decimals = 3,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const { t, dir } = useI18n();

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

  const ranked = rows.filter((row) => !row.is_other);
  const other = rows.find((row) => row.is_other);
  const leader = Math.max(0, ...ranked.map((row) => Number(row.value) || 0));
  const topShare = ranked.reduce((sum, row) => sum + (Number(row.share) || 0), 0);

  return (
    <ChartFrame
      title={title}
      description={description}
      columns={columns}
      rows={rows}
      loading={loading}
      error={error}
      onRetry={onRetry}
      height="auto"
      className={className}
      emptyDescription={t('charts.rankEmpty')}
      footnote={other ? t('charts.leaderFootnote') : undefined}
    >
      <div dir={dir}>
        {ranked.length > 0 && other ? (
          <p className="mb-3 text-xs text-(--color-text-2)">
            {t('charts.topShare', {
              count: formatNumber(ranked.length),
              share: formatPercent(topShare),
            })}
          </p>
        ) : null}

        <ol className="space-y-1">
          {ranked.map((row, index) => (
            <RankRow
              key={row.key}
              rank={index + 1}
              label={row.label}
              value={formatValue(row.value)}
              share={formatPercent(row.share)}
              width={leader > 0 ? (Number(row.value) / leader) * 100 : 0}
            />
          ))}
        </ol>

        {other ? (
          <div className="mt-2 flex items-center gap-3 border-t border-(--border-subtle) px-2 pt-3 text-sm">
            <span aria-hidden="true" className="w-6 shrink-0" />
            <span className="min-w-0 flex-1 truncate text-(--color-text-2)">{other.label}</span>
            <span className="tabular shrink-0 text-(--color-text-2)">
              {formatValue(other.value)}
            </span>
            <span className="tabular w-14 shrink-0 text-end text-(--color-muted)">
              {formatPercent(other.share)}
            </span>
          </div>
        ) : null}
      </div>
    </ChartFrame>
  );
}

function RankRow({ rank, label, value, share, width }) {
  const top = rank <= 3;

  return (
    <li className="group flex items-center gap-3 rounded-(--radius-control) px-2 py-2 transition-colors hover:bg-(--color-surface-selected)">
      <span
        className={`tabular flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
          top ? 'bg-(--color-brand-soft) text-(--color-brand-text)' : 'text-(--color-muted)'
        }`}
      >
        {formatNumber(rank)}
      </span>

      <span className="min-w-0 flex-1">
        {/*
          `unicode-bidi: plaintext` gives the name its OWN direction from its
          first strong character, so "لابتوب ١٥ إنش Core i7 32GB" stays in
          the order it was typed instead of being rearranged by the page's.
          One line, the rest in the tooltip: a ranking is scanned, not read.
        */}
        <span
          title={label}
          style={{ unicodeBidi: 'plaintext' }}
          className="block truncate text-sm text-(--color-text)"
        >
          {label}
        </span>
        <span className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-(--color-surface-selected)">
          <span
            className="block h-full rounded-full bg-(--chart-1) motion-safe:transition-[width] motion-safe:duration-500"
            style={{ width: `${Math.max(width, 1.5)}%` }}
          />
        </span>
      </span>

      <span className="tabular shrink-0 text-sm font-medium text-(--color-text)">{value}</span>
      <span className="tabular w-14 shrink-0 text-end text-xs text-(--color-text-2)">{share}</span>
    </li>
  );
}
