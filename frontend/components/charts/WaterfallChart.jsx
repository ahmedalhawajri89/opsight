'use client';

import { ChartFrame } from './ChartFrame';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { formatMoney, formatPercent, getMoneyDefaults } from '@/lib/format';

/**
 * From revenue to profit, as an equation and a split.
 *
 * IT WAS A WATERFALL — floating bars on an axis — and a waterfall makes the
 * reader do the subtraction by eye: estimate where one bar ends, where the
 * next begins, read the difference off a scale. The owner asked for
 * something modern; what the panel needed was to be legible.
 *
 * Two parts, each answering one question:
 *
 *  1. HOW DOES REVENUE BECOME PROFIT? The arithmetic written out as cards —
 *     revenue − cost of goods = gross profit − operating expenses = net
 *     profit — with each subtotal's margin beside it. It reads as a
 *     sentence, left to right or right to left, and every figure is the
 *     server's own: nothing here is computed except the order they sit in.
 *
 *  2. WHERE DID EACH UNIT OF REVENUE GO? One bar, split into cost of goods,
 *     running costs and what was left. In a month that lost money the costs
 *     run past a marker at revenue, so the overrun is visible at a glance
 *     instead of hidden below a zero line.
 *
 * Props are the ones the waterfall took, so the page did not change.
 */
const SPLIT = [
  { key: 'cogs', colour: 'var(--chart-2)' },
  { key: 'operating_expenses', colour: 'var(--chart-4)' },
  { key: 'net_profit', colour: 'var(--chart-3)' },
];

export function WaterfallChart({
  title,
  description,
  steps = [],
  margins = {},
  currency = getMoneyDefaults().currency,
  decimals = 3,
  loading = false,
  error = null,
  onRetry,
  className,
}) {
  const { t, dir } = useI18n();
  const money = (value) => formatMoney(value, { currency, decimals });
  const byKey = Object.fromEntries(steps.map((step) => [step.key, step]));
  const valueOf = (key) => {
    const n = Number(byKey[key]?.value);

    return Number.isFinite(n) ? n : null;
  };

  const revenue = valueOf('net_revenue');
  const hasData = revenue !== null && steps.some((step) => Number(step.value) !== 0);

  const columns = [
    { key: 'label', header: t('charts.step') },
    {
      key: 'value',
      header: title,
      numeric: true,
      cell: (row) =>
        row.value === null || row.value === undefined ? '—' : money(row.kind === 'down' ? -Number(row.value) : row.value),
    },
  ];

  return (
    <ChartFrame
      title={title}
      description={description}
      icon="analytics"
      columns={columns}
      rows={hasData ? steps : []}
      loading={loading}
      error={error}
      onRetry={onRetry}
      height="auto"
      className={className}
      emptyDescription={t('charts.noData')}
    >
      {hasData ? (
        <div dir={dir} className="space-y-6">
          <Equation steps={steps} margins={margins} money={money} />
          <Split revenue={revenue} valueOf={valueOf} labelOf={(key) => byKey[key]?.label ?? key} />
        </div>
      ) : null}
    </ChartFrame>
  );
}

/** revenue − cogs = gross profit − expenses = net profit, as cards. */
function Equation({ steps, margins, money }) {
  const { t } = useI18n();

  return (
    <ol className="flex flex-col items-stretch gap-2 lg:flex-row lg:items-center">
      {steps.map((step, index) => {
        const amount = Number(step.value);
        const total = step.kind === 'total';
        const last = index === steps.length - 1;
        const loss = last && amount < 0;
        const margin = margins[step.key];

        return (
          <li key={step.key} className="contents">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className="tabular flex size-7 shrink-0 items-center justify-center self-center rounded-full bg-(--color-surface-selected) text-sm font-semibold text-(--color-text-2)"
              >
                {step.kind === 'down' ? '−' : '='}
              </span>
            ) : null}
            <div
              className={cn(
                'min-w-0 flex-1 rounded-xl border p-3.5',
                !total && 'border-(--border-subtle)',
                total && !last && 'border-transparent bg-(--color-surface-selected)',
                last && !loss && 'border-transparent bg-(--color-success-soft)',
                loss && 'border-transparent bg-(--color-danger-soft)',
              )}
            >
              <p className="truncate text-xs text-(--color-text-2)">
                {/* Said in words too: the operator glyph is decorative. */}
                <span className="sr-only">{step.kind === 'down' ? t('charts.minus') : index > 0 ? t('charts.equals') : ''} </span>
                {step.label}
              </p>
              <p
                className={cn(
                  'tabular mt-1 truncate font-semibold',
                  total ? 'text-lg' : 'text-base',
                  loss ? 'text-(--color-danger)' : 'text-(--color-text)',
                )}
              >
                {step.value === null || step.value === undefined ? '—' : money(step.value)}
              </p>
              {margin !== null && margin !== undefined ? (
                <p className="mt-1 text-xs text-(--color-text-2)">
                  {t('charts.marginOf', { margin: formatPercent(margin) })}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Where each unit of revenue went: one bar, three parts. */
function Split({ revenue, valueOf, labelOf }) {
  const { t } = useI18n();

  if (!(revenue > 0)) return null;

  const cogs = Math.max(0, valueOf('cogs') ?? 0);
  const expenses = Math.max(0, valueOf('operating_expenses') ?? 0);
  const profit = Math.max(0, revenue - cogs - expenses);
  const costs = cogs + expenses;
  // The bar is as long as the larger of revenue and total costs, so a loss
  // runs past the revenue marker instead of being clipped at 100%.
  const scale = Math.max(revenue, costs);
  const parts = { cogs, operating_expenses: expenses, net_profit: profit };
  const overrun = costs > revenue;

  return (
    <div>
      <p className="mb-2 text-xs font-medium text-(--color-text-2)">{t('charts.whereRevenueWent')}</p>

      <div className="relative">
        <div className="flex h-3 overflow-hidden rounded-full bg-(--color-surface-selected)">
          {SPLIT.map(({ key, colour }) =>
            parts[key] > 0 ? (
              <span
                key={key}
                className="h-full first:rounded-s-full last:rounded-e-full"
                style={{ width: `${(parts[key] / scale) * 100}%`, background: colour }}
              />
            ) : null,
          )}
        </div>
        {overrun ? (
          <span
            className="absolute -top-1 h-5 w-0.5 rounded bg-(--color-text)"
            style={{ insetInlineStart: `${(revenue / scale) * 100}%` }}
            title={t('charts.revenueMarker')}
          />
        ) : null}
      </div>

      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-xs">
        {SPLIT.map(({ key, colour }) => (
          <li key={key} className="flex items-center gap-1.5 text-(--color-text-2)">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: colour }} />
            {labelOf(key)}
            <span className="tabular font-semibold text-(--color-text)">{formatPercent(parts[key] / revenue)}</span>
          </li>
        ))}
        {overrun ? (
          <li className="text-(--color-danger)">
            {t('charts.overrun', { share: formatPercent((costs - revenue) / revenue) })}
          </li>
        ) : null}
      </ul>
    </div>
  );
}
