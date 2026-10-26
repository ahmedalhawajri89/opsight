'use client';

import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Sector, Tooltip } from 'recharts';

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
  'var(--chart-1)',
  'var(--chart-3)',
  'var(--chart-2)',
  'var(--chart-4)',
  'var(--chart-6)',
];
const OTHER = 'var(--chart-5)';

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

  // The slice being pointed at — from the ring or from its legend row.
  const [active, setActive] = useState(null);

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
        <div className="flex flex-col items-center gap-4 @[20rem]:flex-row">
          <div className="relative size-40 shrink-0" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="numeric"
                  nameKey="name"
                  innerRadius="68%"
                  outerRadius="94%"
                  stroke="var(--surface)"
                  strokeWidth={2}
                  activeShape={(props) => <Sector {...props} outerRadius={props.outerRadius + 6} />}
                  onMouseEnter={(_, index) => setActive(index)}
                  onMouseLeave={() => setActive(null)}
                  startAngle={90}
                  endAngle={dir === 'rtl' ? 450 : -270}
                  isAnimationActive={!reducedMotion}
                  animationDuration={800}
                >
                  {data.map((row) => (
                    <Cell
                      key={row.key}
                      fill={row.colour}
                      // Everything but the pointed-at slice steps back.
                      fillOpacity={active === null || data[active]?.key === row.key ? 1 : 0.35}
                      style={{ transition: 'fill-opacity var(--duration-fast) var(--ease-out)' }}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;

                    const row = payload[0].payload;

                    return (
                      <div
                        dir={dir}
                        className="rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-3 py-2 text-xs shadow-(--shadow-overlay)"
                      >
                        <p className="font-semibold text-(--color-text)">{row.name}</p>
                        <p className="tabular mt-0.5 text-(--color-text-2)">
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
                  className="tabular text-lg leading-tight font-bold whitespace-nowrap text-(--color-text)"
                >
                  {centreText}
                </bdi>
                <span className="mt-1 text-xs text-(--color-text-2)">
                  {t('dashboard.categories.total')}
                </span>
              </div>
            )}
          </div>

          {/*
            A bar per category rather than a list of dots and figures.
            A share is a LENGTH before it is a number: five bars put the
            categories in order at a glance, where five percentages have to
            be read and compared one against another.

            The ring stays beside them — it answers "how is the whole split"
            and the bars answer "which is biggest" — and hovering either one
            lights the other.
          */}
          <ul className="w-full min-w-0 flex-1 space-y-2.5">
            {data.map((row, index) => (
              <li
                key={row.key}
                onMouseEnter={() => setActive(index)}
                onMouseLeave={() => setActive(null)}
                className={cn(
                  'rounded-(--radius-control) px-1.5 py-1 text-sm transition-colors duration-(--duration-fast)',
                  active === index && 'bg-(--color-surface-hover)',
                )}
              >
                <div className="flex items-center gap-2">
                  {/* dir="auto": a Latin name in an Arabic page truncates at its own end. */}
                  <span
                    dir="auto"
                    className={cn(
                      'min-w-0 flex-1 truncate text-start text-xs',
                      row.is_other ? 'text-(--color-text-2)' : 'text-(--color-text)',
                    )}
                  >
                    {row.name}
                  </span>
                  <span className="tabular shrink-0 text-xs font-semibold text-(--color-text)">
                    {row.share === null ? EMPTY : formatPercent(row.share)}
                  </span>
                </div>

                {/*
                  The track is the whole; the fill is this category's share
                  of it. A real meter, so a screen reader is told the figure
                  rather than meeting a decorative div.
                */}
                <div
                  role="meter"
                  aria-valuenow={row.share === null ? undefined : Math.round(row.share * 100)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={row.name}
                  className="mt-1 h-2 w-full overflow-hidden rounded-full bg-(--color-surface-subtle)"
                >
                  <div
                    className="h-full rounded-full transition-[inline-size] duration-(--duration-slow) ease-(--ease-out)"
                    style={{
                      inlineSize: `${Math.max(row.share === null ? 0 : row.share * 100, 1.5)}%`,
                      background: row.colour,
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ChartFrame>
  );
}
