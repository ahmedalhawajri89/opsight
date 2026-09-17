'use client';

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

import { ChartFrame } from './ChartFrame';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';
import { EMPTY, figureDirection, formatMoney, formatPercent } from '@/lib/format';

/**
 * Sales by category, as shares of a ring.
 *
 * A donut is allowed here because every rule that keeps one honest holds: at
 * most five named slices and an "Other", shares that sum to the whole (the
 * server adds the Other row to guarantee it), and a legend that states every
 * share in text — no reader has to judge an angle.
 *
 * THE CENTRE is the period's net revenue — the same figure as the first KPI
 * card, passed in rather than summed from the slices. The slices are line
 * sales (before order-level discounts and refunds), so their own sum is a
 * slightly different number; putting that in the middle would show two
 * "revenues" on one screen. The ring shows how the business divides; the
 * centre says how much there was.
 */
const COLOURS = [
  'var(--series-1)',
  'var(--series-3)',
  'var(--series-2)',
  'var(--series-4)',
  'var(--series-6)',
];
const OTHER = 'var(--series-5)';

export function CategoryShareChart({
  rows = [],
  total,
  currency,
  decimals,
  loading,
  className,
  style,
}) {
  const { t, dir } = useI18n();
  const reducedMotion = useReducedMotion();

  const data = rows.map((row, index) => ({
    ...row,
    numeric: Number(row.value) || 0,
    colour: row.is_other ? OTHER : COLOURS[index % COLOURS.length],
    name: row.is_other ? t('dashboard.categories.other') : row.label,
  }));

  const sum = data.reduce((acc, row) => acc + row.numeric, 0);
  const centre = total ?? null;
  const centreText = centre === null ? '' : formatMoney(centre, { currency, decimals: 0 });

  const columns = [
    { key: 'name', header: t('charts.name') },
    {
      key: 'value',
      header: t('dashboard.categories.sales'),
      numeric: true,
      cell: (row) => formatMoney(row.value, { currency, decimals }),
    },
    {
      key: 'share',
      header: t('charts.share'),
      numeric: true,
      cell: (row) => (row.share === null ? EMPTY : formatPercent(row.share)),
    },
  ];

  return (
    <ChartFrame
      title={t('dashboard.categories.title')}
      description={t('dashboard.categories.description')}
      icon="pie"
      columns={columns}
      rows={sum > 0 ? data : []}
      loading={loading}
      emptyDescription={t('charts.rankEmpty')}
      height="auto"
      className={className}
      style={style}
    >
      {/*
        Laid out by the width of the PANEL, not the viewport: in a two-column
        row a wide screen gives this chart the width of a phone.
      */}
      <div dir={dir} className="@container">
        <div className="flex flex-col items-center gap-6 @[20rem]:flex-row">
          <div className="relative size-44 shrink-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="numeric"
                  nameKey="name"
                  innerRadius="62%"
                  outerRadius="100%"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  startAngle={90}
                  endAngle={dir === 'rtl' ? 450 : -270}
                  isAnimationActive={!reducedMotion}
                  animationDuration={800}
                >
                  {data.map((row) => (
                    <Cell key={row.key} fill={row.colour} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;

                    const row = payload[0].payload;

                    return (
                      <div
                        dir={dir}
                        className="rounded-(--radius-md) border border-(--color-line) bg-(--color-surface-raised) px-3 py-2 text-xs shadow-(--shadow-overlay)"
                      >
                        <p className="font-semibold text-(--color-text)">{row.name}</p>
                        <p className="tabular mt-0.5 text-(--color-text-muted)">
                          {formatMoney(row.value, { currency, decimals })} ·{' '}
                          {row.share === null ? EMPTY : formatPercent(row.share)}
                        </p>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {centre !== null && (
              <div
                dir={dir}
                className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
              >
                <bdi
                  dir={figureDirection(centreText)}
                  className="tabular text-[0.9375rem] leading-tight font-bold whitespace-nowrap text-(--color-text)"
                >
                  {centreText}
                </bdi>
                <span className="mt-1 text-[0.6875rem] text-(--color-text-muted)">
                  {t('dashboard.categories.total')}
                </span>
              </div>
            )}
          </div>

          <ul className="w-full min-w-0 flex-1 space-y-3">
            {data.map((row) => (
              <li key={row.key} className="flex items-center gap-3 text-[0.8125rem]">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: row.colour }}
                />
                {/* dir="auto": a Latin name in an Arabic page truncates at its own end. */}
                <span
                  dir="auto"
                  className={cn(
                    'min-w-0 flex-1 truncate text-start',
                    row.is_other ? 'text-(--color-text-muted)' : 'text-(--color-text)',
                  )}
                >
                  {row.name}
                </span>
                <span className="tabular shrink-0 text-end font-medium text-(--color-text)">
                  {row.share === null ? EMPTY : formatPercent(row.share)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ChartFrame>
  );
}
