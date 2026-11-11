'use client';

import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { DateInput, MoneyInput } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/layout/PageHeader';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { CHART_TYPE, ChartFrame } from '@/components/charts/ChartFrame';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatShortDate,
} from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import * as forecasts from '@/services/forecasts';

/**
 * Thirteen weeks of cash (phase D2).
 *
 * WHAT AN OWNER READS FIRST is whether the money lasts: the lowest point of
 * the quarter and, if there is one, the first week the balance goes below
 * zero. Then the chart: money in and out each week as bars, the balance as a
 * line across them.
 *
 * THE ONE FIGURE THE SYSTEM CANNOT KNOW is what is in the bank. An owner who
 * states it sees the forecast at its real level. Without it, the line is the
 * running net flow from zero — the shape of the quarter, not its level — and
 * the screen says so, rather than letting zero pass for a balance.
 *
 * Conservative, and visibly so: money customers owe past its expected day
 * is shown beside the forecast and NOT counted in it. Every assumption the
 * server used is listed under the chart, so the owner can disagree with it.
 * The client computes nothing here; every figure arrives from the server.
 */
const IN = 'var(--chart-1)';
const OUT = 'var(--chart-2)';
const BALANCE = 'var(--chart-4)';

export function CashForecastView() {
  const { t, dir } = useI18n();
  const { can } = useAuth();
  const rtl = dir === 'rtl';
  const reducedMotion = useReducedMotion();

  const query = useQuery({ queryKey: queryKeys.forecasts.cash, queryFn: forecasts.cash });

  if (query.isError && query.error?.isForbidden) return <ForbiddenState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const data = query.data?.data;
  const hasBalance = data?.opening_balance !== null && data?.opening_balance !== undefined;
  const money = (value) => formatMoney(value);
  const assumptions = data?.assumptions;

  const rows = (data?.weeks ?? []).map((week) => ({
    key: week.start,
    label: formatShortDate(week.start),
    range: `${formatDate(week.start)} – ${formatDate(week.end)}`,
    in: week.in.total,
    out: week.out.total,
    net: week.net,
    running: week.running,
    inNumeric: Number(week.in.total) || 0,
    // Drawn below the axis: money leaving is a fall.
    outNumeric: -(Number(week.out.total) || 0),
    runningNumeric: Number(week.running) || 0,
  }));

  const columns = [
    { key: 'range', header: t('forecasts.cash.columns.week') },
    {
      key: 'in',
      header: t('forecasts.cash.columns.in'),
      numeric: true,
      cell: (row) => money(row.in),
    },
    {
      key: 'out',
      header: t('forecasts.cash.columns.out'),
      numeric: true,
      cell: (row) => money(row.out),
    },
    {
      key: 'net',
      header: t('forecasts.cash.columns.net'),
      numeric: true,
      cell: (row) => money(row.net),
    },
    {
      key: 'running',
      header: hasBalance
        ? t('forecasts.cash.columns.balance')
        : t('forecasts.cash.columns.runningNet'),
      numeric: true,
      cell: (row) => (
        <span
          className={cn(
            hasBalance && Number(row.running) < 0 && 'font-semibold text-(--color-danger)',
          )}
        >
          {money(row.running)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <Verdict data={data} hasBalance={hasBalance} />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <BalanceCard data={data} hasBalance={hasBalance} editable={can('settings.update')} />

        <div className="grid gap-3 sm:grid-cols-3">
          <Tile
            icon="trendUp"
            tone="success"
            label={t('forecasts.cash.totalIn')}
            value={data ? money(data.totals.in) : '—'}
          />
          <Tile
            icon="receipt"
            tone="danger"
            label={t('forecasts.cash.totalOut')}
            value={data ? money(data.totals.out) : '—'}
          />
          <Tile
            icon="wallet"
            tone={hasBalance && data && Number(data.lowest?.value) < 0 ? 'danger' : 'info'}
            label={hasBalance ? t('forecasts.cash.lowest') : t('forecasts.cash.lowestNet')}
            value={data?.lowest ? money(data.lowest.value) : '—'}
            detail={
              data?.lowest
                ? t('forecasts.cash.weekOf', { date: formatDate(data.lowest.start) })
                : null
            }
          />
        </div>
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <ChartFrame
            bare
            title={t('forecasts.cash.chartTitle')}
            description={
              hasBalance ? t('forecasts.cash.chartBalance') : t('forecasts.cash.chartNoBalance')
            }
            icon="chart"
            columns={columns}
            rows={rows}
            loading={query.isLoading}
            emptyDescription={t('charts.noData')}
            legend={<Legend hasBalance={hasBalance} />}
            height={300}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={rows}
                stackOffset="sign"
                margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
              >
                <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="0" />
                <XAxis
                  dataKey="label"
                  reversed={rtl}
                  tick={CHART_TYPE.tick}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  interval="preserveStartEnd"
                  minTickGap={12}
                />
                <YAxis
                  orientation={rtl ? 'right' : 'left'}
                  tickFormatter={(value) => formatMoneyCompact(value)}
                  tick={CHART_TYPE.tick}
                  tickLine={false}
                  axisLine={false}
                  width={62}
                />
                <ReferenceLine y={0} stroke="var(--border-strong, var(--color-line-strong))" />
                <Tooltip
                  cursor={{ fill: 'var(--surface-hover)', radius: 6 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;

                    const row = payload[0].payload;

                    return (
                      <div
                        dir={dir}
                        className="min-w-52 rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-3 py-2.5 text-xs shadow-(--shadow-overlay)"
                      >
                        <p className="font-medium text-(--color-text-2)">{row.range}</p>
                        <TooltipRow
                          colour={IN}
                          label={t('forecasts.cash.columns.in')}
                          value={money(row.in)}
                        />
                        <TooltipRow
                          colour={OUT}
                          label={t('forecasts.cash.columns.out')}
                          value={money(row.out)}
                        />
                        <TooltipRow
                          colour={BALANCE}
                          label={
                            hasBalance
                              ? t('forecasts.cash.columns.balance')
                              : t('forecasts.cash.columns.runningNet')
                          }
                          value={money(row.running)}
                        />
                      </div>
                    );
                  }}
                />
                <Bar
                  dataKey="inNumeric"
                  stackId="flow"
                  fill={IN}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={!reducedMotion}
                />
                <Bar
                  dataKey="outNumeric"
                  stackId="flow"
                  fill={OUT}
                  radius={[5, 5, 0, 0]}
                  maxBarSize={20}
                  isAnimationActive={!reducedMotion}
                />
                <Line
                  type="monotone"
                  dataKey="runningNumeric"
                  stroke={BALANCE}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 4 }}
                  isAnimationActive={!reducedMotion}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartFrame>
        </div>
      </Card>

      {assumptions && Number(assumptions.overdue_receivables) > 0 ? (
        <div className="flex items-start gap-3 rounded-(--radius-card) border border-(--color-warning) bg-(--color-warning-soft) p-4">
          <Icon
            name="alert"
            size={18}
            className="mt-0.5 shrink-0 text-(--color-warning)"
            aria-hidden="true"
          />
          <p className="measure text-sm text-(--color-text)">
            {t('forecasts.cash.overdue', { amount: money(assumptions.overdue_receivables) })}
          </p>
        </div>
      ) : null}

      {assumptions ? <Assumptions assumptions={assumptions} /> : null}
    </div>
  );
}

/** The sentence an owner came for: does the money last the quarter? */
function Verdict({ data, hasBalance }) {
  const { t } = useI18n();

  if (!data) return null;

  if (!hasBalance) {
    return (
      <Banner tone="info" icon="info">
        {t('forecasts.cash.verdict.noBalance')}
      </Banner>
    );
  }

  if (data.first_negative_week) {
    return (
      <Banner tone="danger" icon="alert">
        {t('forecasts.cash.verdict.negative', { date: formatDate(data.first_negative_week.start) })}
      </Banner>
    );
  }

  return (
    <Banner tone="success" icon="check">
      {t('forecasts.cash.verdict.lasts', {
        amount: formatMoney(data.lowest?.value),
        date: formatDate(data.lowest?.start),
      })}
    </Banner>
  );
}

const BANNER_TONES = {
  info: 'border-(--color-line) bg-(--color-info-soft) [&>svg]:text-(--color-info)',
  danger: 'border-(--color-danger) bg-(--color-danger-soft) [&>svg]:text-(--color-danger)',
  success: 'border-(--color-line) bg-(--color-success-soft) [&>svg]:text-(--color-success)',
};

function Banner({ tone, icon, children }) {
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-(--radius-card) border p-4',
        BANNER_TONES[tone],
      )}
    >
      <Icon name={icon} size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-sm font-medium text-(--color-text)">{children}</p>
    </div>
  );
}

/**
 * What is in the bank, and as of when. Editable by a role that may change
 * the settings; everyone else reads it.
 */
function BalanceCard({ data, hasBalance, editable }) {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const today = data?.generated_for ?? '';
  // A draft is null until the owner types: until then the field shows what
  // the server holds, and a fresh answer from it shows through.
  const [draftAmount, setAmount] = useState(null);
  const [draftAsOf, setAsOf] = useState(null);
  const amount = draftAmount ?? data?.opening_balance ?? '';
  const asOf = draftAsOf ?? data?.opening_balance_as_of ?? today;
  const id = useId();

  const save = useMutation({
    mutationFn: forecasts.setCashBalance,
    onSuccess: () => {
      setAmount(null);
      setAsOf(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.forecasts.cash });
    },
  });

  const amountError = save.error?.errors?.amount?.[0];
  const asOfError = save.error?.errors?.as_of?.[0];

  return (
    <Card>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--color-brand-soft) text-(--color-brand-text)">
          <Icon name="coins" size={18} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-(--color-text)">
            {t('forecasts.cash.balance.title')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-(--color-text-2)">
            {hasBalance
              ? t('forecasts.cash.balance.stated', {
                  amount: formatMoney(data.opening_balance),
                  date: formatDate(data.opening_balance_as_of),
                })
              : t('forecasts.cash.balance.why')}
          </p>
        </div>
      </div>

      {editable ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate({ amount: amount === '' ? null : amount, as_of: asOf || null });
          }}
        >
          <div className="flex min-w-36 flex-1 flex-col gap-1.5">
            <label htmlFor={`${id}-amount`} className="text-xs font-medium text-(--color-text-2)">
              {t('forecasts.cash.balance.amount')}
            </label>
            <MoneyInput
              id={`${id}-amount`}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              invalid={Boolean(amountError)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-as-of`} className="text-xs font-medium text-(--color-text-2)">
              {t('forecasts.cash.balance.asOf')}
            </label>
            <DateInput
              id={`${id}-as-of`}
              value={asOf}
              max={today}
              onChange={(event) => setAsOf(event.target.value)}
              invalid={Boolean(asOfError)}
            />
          </div>
          <Button type="submit" variant="primary" loading={save.isPending}>
            {t('forecasts.cash.balance.save')}
          </Button>
          {hasBalance ? (
            <Button
              type="button"
              variant="ghost"
              disabled={save.isPending}
              onClick={() => save.mutate({ amount: null, as_of: null })}
            >
              {t('forecasts.cash.balance.clear')}
            </Button>
          ) : null}
          {amountError || asOfError ? (
            <p role="alert" className="w-full text-xs text-(--color-danger)">
              {amountError ?? asOfError}
            </p>
          ) : null}
        </form>
      ) : null}
    </Card>
  );
}

const TILE_TONES = {
  danger: 'bg-(--color-danger-soft) text-(--color-danger)',
  info: 'bg-(--color-info-soft) text-(--color-info)',
  success: 'bg-(--color-success-soft) text-(--color-success)',
};

function Tile({ icon, tone, label, value, detail }) {
  return (
    <div className="flex items-start gap-3 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4">
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-xl',
          TILE_TONES[tone],
        )}
      >
        <Icon name={icon} size={18} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        <span className="block text-xs text-(--color-text-2)">{label}</span>
        <span className="tabular mt-1 block truncate text-lg font-semibold text-(--color-text)">
          {value}
        </span>
        {detail ? <span className="block text-xs text-(--color-muted)">{detail}</span> : null}
      </span>
    </div>
  );
}

function Legend({ hasBalance }) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 pb-2 text-xs text-(--color-text-2)">
      {[
        [IN, t('forecasts.cash.columns.in'), 'rounded-full'],
        [OUT, t('forecasts.cash.columns.out'), 'rounded-full'],
        [
          BALANCE,
          hasBalance ? t('forecasts.cash.columns.balance') : t('forecasts.cash.columns.runningNet'),
          'h-0.5 w-4',
        ],
      ].map(([colour, label, shape]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('size-2.5', shape)}
            style={{ background: colour }}
          />
          {label}
        </span>
      ))}
    </div>
  );
}

function TooltipRow({ colour, label, value }) {
  return (
    <p className="mt-1.5 flex items-center gap-2">
      <span aria-hidden="true" className="size-2 rounded-full" style={{ background: colour }} />
      <span className="flex-1 text-(--color-text-2)">{label}</span>
      <span className="tabular font-semibold text-(--color-text)">{value}</span>
    </p>
  );
}

/** What the forecast believes, so the owner can judge it. */
function Assumptions({ assumptions }) {
  const { t } = useI18n();

  const facts = [
    [
      t('forecasts.cash.assumptions.daysToPay'),
      t('forecasts.stock.days', { days: formatNumber(assumptions.median_days_to_pay) }),
    ],
    [
      t('forecasts.cash.assumptions.withinWeek'),
      formatPercent(assumptions.paid_within_week, { decimals: 0 }),
    ],
    [t('forecasts.cash.assumptions.weeklySales'), formatMoney(assumptions.weekly_sales)],
    [
      t('forecasts.cash.assumptions.stockOrders'),
      t('forecasts.cash.assumptions.stockOrdersValue', {
        count: formatNumber(assumptions.stock_orders.count),
        amount: formatMoney(assumptions.stock_orders.total),
      }),
    ],
  ];

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card title={t('forecasts.cash.assumptions.title')} icon="focus">
        <dl className="divide-y divide-(--color-line)">
          {facts.map(([label, value]) => (
            <div
              key={label}
              className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
            >
              <dt className="text-sm text-(--color-text-2)">{label}</dt>
              <dd className="tabular text-sm font-semibold text-(--color-text)">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="measure mt-4 text-xs leading-relaxed text-(--color-muted)">
          {t('forecasts.cash.notIncluded')}
        </p>
      </Card>

      <Card title={t('forecasts.cash.assumptions.recurring')} icon="repeat">
        {assumptions.recurring.length === 0 ? (
          <p className="text-sm text-(--color-text-2)">
            {t('forecasts.cash.assumptions.noRecurring')}
          </p>
        ) : (
          <ul className="divide-y divide-(--color-line)">
            {assumptions.recurring.map((item) => (
              <li
                key={item.category}
                className="flex items-baseline justify-between gap-4 py-2.5 first:pt-0 last:pb-0"
              >
                <span className="min-w-0">
                  <span
                    className="block truncate text-sm font-medium text-(--color-text)"
                    style={{ unicodeBidi: 'plaintext' }}
                  >
                    {item.category}
                  </span>
                  <span className="block text-xs text-(--color-muted)">
                    {t('forecasts.cash.assumptions.monthlyOn', { day: formatNumber(item.day) })}
                  </span>
                </span>
                <span className="tabular text-sm font-semibold text-(--color-text)">
                  {formatMoney(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
