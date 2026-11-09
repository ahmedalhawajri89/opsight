'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { ChartFrame } from './ChartFrame';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney, formatMoneyCompact, getMoneyDefaults } from '@/lib/format';

/**
 * How the period's revenue became its profit, in one picture.
 *
 * WHY THIS CHART EXISTS. The analytics screen already carried every figure in
 * it — net revenue, cost of goods, gross profit, operating expenses, net
 * profit — as five separate cells in a panel of fifteen. What it never showed
 * was the ARITHMETIC between them: that 151,290 became 2,853 because the
 * goods cost 100,761 and running the business cost another 47,675. A reader
 * had to hold five numbers in their head and subtract. That is the one piece
 * of work a profit-and-loss screen exists to do for them.
 *
 * NOT A SECOND SOURCE OF TRUTH. Every step is a metric the server already
 * computed and the page already has; nothing here adds, and the two totals
 * are the server's own `gross_profit` and `net_profit` rather than sums taken
 * from the bars. If the service ever changes what gross profit means, this
 * chart changes with it instead of disagreeing with the tile above it.
 *
 * HOW A WATERFALL IS DRAWN IN RECHARTS. Two stacked bars per column: an
 * invisible one that lifts the visible one to where it should start. The
 * `base` value is therefore layout, not data — it is kept out of the table
 * view and out of the tooltip, both of which show only the step's own amount.
 *
 * TWO HUES, NOT RED AND GREEN. A cost is not a failure and a total is not a
 * success; they are different KINDS of row, which is a categorical
 * distinction. Red for every deduction would read as four problems, and
 * UI_UX_DIRECTION.md §4 reserves the semantic palette for meaning. The one
 * place a status colour does appear is a NEGATIVE total, because a business
 * that lost money over the period is a fact the chart should not whisper.
 */
export function WaterfallChart({
  title,
  description,
  steps = [],
  currency = getMoneyDefaults().currency,
  decimals = 3,
  loading = false,
  error = null,
  onRetry,
  height = 300,
  className,
}) {
  const { t, dir } = useI18n();
  const rtl = dir === 'rtl';

  const money = (value) => formatMoney(value, { currency, decimals });

  /*
   * The running base, derived here rather than asked of the caller.
   *
   * A `total` step stands on the axis. A `down` step hangs from the total
   * before it and reaches the total after it, so its base is whatever the
   * running figure becomes once it has been taken off.
   */
  const data = steps.reduce((rows, step) => {
    const running = rows.length === 0 ? 0 : rows[rows.length - 1].running;
    const amount = Number(step.value);
    const valid = Number.isFinite(amount);

    if (step.kind === 'total') {
      const total = valid ? amount : running;

      rows.push({
        ...step,
        amount: valid ? amount : null,
        base: total < 0 ? total : 0,
        span: Math.abs(total),
        negative: total < 0,
        running: total,
      });

      return rows;
    }

    const after = valid ? running - amount : running;

    rows.push({
      ...step,
      amount: valid ? amount : null,
      base: Math.min(running, after),
      span: valid ? Math.abs(amount) : 0,
      running: after,
    });

    return rows;
  }, []);

  const columns = [
    { key: 'label', header: t('charts.step') },
    {
      key: 'amount',
      header: title,
      numeric: true,
      // The deduction is shown as a deduction, not as a bare positive.
      cell: (row) =>
        row.amount === null ? '—' : money(row.kind === 'down' ? -row.amount : row.amount),
    },
  ];

  return (
    <ChartFrame
      title={title}
      description={description}
      icon="analytics"
      columns={columns}
      rows={data}
      loading={loading}
      error={error}
      onRetry={onRetry}
      height={height}
      className={className}
      emptyDescription={t('charts.noData')}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 8 }}>
          {/* Horizontal only, at the lightest token (UI_UX_DIRECTION.md §6). */}
          <CartesianGrid vertical={false} stroke="var(--border)" />

          {/*
            The sequence reads in the page's own direction: revenue first.
            Reversed for Arabic rather than left to inherit, because an SVG
            surface does not mirror itself.
          */}
          <XAxis
            dataKey="label"
            reversed={rtl}
            tick={{ fill: 'var(--text-2)', fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: 'var(--border)' }}
            interval={0}
          />

          <YAxis
            orientation={rtl ? 'right' : 'left'}
            tickFormatter={(value) => formatMoneyCompact(value, { currency })}
            tick={{ fill: 'var(--muted)', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={72}
          />

          <Tooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;

              // The visible bar is the second of the two; the first is layout.
              const row = payload[payload.length - 1].payload;

              return (
                <div
                  dir={dir}
                  className="rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-2.5 py-2 text-sm shadow-(--shadow-overlay)"
                >
                  <p className="font-medium text-(--color-text)">{row.label}</p>
                  <p className="tabular text-(--color-text)">
                    {row.amount === null
                      ? '—'
                      : money(row.kind === 'down' ? -row.amount : row.amount)}
                  </p>
                </div>
              );
            }}
          />

          {/* The lift. Never seen, never in the table, never in the tooltip. */}
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />

          {/*
            `maxBarSize`: a column is capped and the rest of its band is air.
            Left to itself Recharts filled the slot — five columns about
            170px wide across the card — and a block that wide stops reading
            as a measured height and starts reading as a panel.
            
            56, not the 24 the mark spec names. That figure is written for a
            dense bar chart, where a column is one of thirty; this is five
            steps across the width of a card, and at 24 they read as needles
            with the chart mostly empty. The rule's stated intent is the
            proportion — "never fill the slot; let the band's leftover be
            air" — and 56 of a ~200px band is 72% air. The departure is from
            the number, not from the rule.
          */}
          <Bar
            dataKey="span"
            stackId="w"
            isAnimationActive={false}
            radius={[2, 2, 0, 0]}
            maxBarSize={56}
          >
            {data.map((row) => (
              <Cell
                key={row.key}
                fill={
                  row.negative
                    ? 'var(--danger)'
                    : row.kind === 'total'
                      ? 'var(--chart-1)'
                      : 'var(--chart-2)'
                }
              />
            ))}

            {/*
              The amount above each column, so the chart is readable without
              the axis — the same reason the ranked bars carry theirs. Compact
              (`١٥١ ألف`), because five exact money strings across a 300px
              chart collide at any width worth having.
            */}
            <LabelList
              dataKey="amount"
              position="top"
              offset={6}
              formatter={(value) => (value === null ? '' : formatMoneyCompact(value, { currency }))}
              fill="var(--text-2)"
              fontSize={11}
              className="tabular"
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
