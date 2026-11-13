'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { CHART_TYPE } from '@/components/charts/ChartFrame';
import { Button } from '@/components/ui/Button';
import { MoneyInput } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';
import {
  formatDate,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatShortDate,
} from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import * as forecasts from '@/services/forecasts';

const INK = 'var(--chart-ink)';
const FLOOR = 'var(--danger)';

/**
 * "How much cash will you have?": the running balance for the next thirteen
 * weeks, the floor the owner set, and the lowest point.
 *
 * Every figure is the cash forecast's: the weekly running balance, the lowest
 * week, the floor and the weeks that fall under it. The sentence underneath
 * is chosen from those, never worked out here.
 *
 * Without a stated opening balance the line is the running net flow from
 * zero, the shape of the quarter but not its level, and the card says so and
 * asks for the balance rather than drawing a floor against a fiction.
 */
export function CashOutlook({ data, currency, decimals, loading, canEdit, className }) {
  const { t, dir } = useI18n();
  const rtl = dir === 'rtl';
  const reducedMotion = useReducedMotion();
  const money = (value) => formatMoney(value, { currency, decimals });

  const hasBalance = data?.opening_balance !== null && data?.opening_balance !== undefined;
  const floor = hasBalance && data?.safety_threshold != null ? Number(data.safety_threshold) : null;
  const below = data?.below_threshold_weeks ?? [];
  const weeks = data?.weeks ?? [];

  const rows = weeks.map((week, index) => ({
    key: week.start,
    label: formatShortDate(week.start),
    start: week.start,
    running: week.running,
    value: Number(week.running),
    below: below.includes(index),
  }));

  const lowest = data?.lowest ? rows[data.lowest.week] : null;

  return (
    <section
      aria-labelledby="cash-title"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) px-6 py-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="cash-title" className="text-[1.0625rem] font-bold text-(--color-text)">
            {t('dashboard.home.cash.title')}
          </h2>
          <p className="text-xs text-(--color-text-2)">
            {hasBalance
              ? t('dashboard.home.cash.subtitle')
              : t('dashboard.home.cash.subtitleNoBalance')}
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-x-3.5 gap-y-1 text-xs text-(--color-text-2)">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-[2.5px] w-4 rounded-sm"
              style={{ background: INK }}
            />
            {t('dashboard.home.cash.expected')}
          </li>
          {floor !== null && (
            <li className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="w-4 border-t-2 border-dashed border-(--color-danger)"
              />
              {t('dashboard.home.cash.floor', { value: money(data.safety_threshold) })}
            </li>
          )}
        </ul>
      </div>

      {loading || !data ? (
        <div aria-hidden="true" className="skeleton h-48 rounded-(--radius-panel)" />
      ) : (
        <div dir="ltr" className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 22, right: 8, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id="cash-area" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-band)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--chart-band)" stopOpacity={0.15} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border-subtle)" strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                reversed={rtl}
                tick={CHART_TYPE.tick}
                tickLine={false}
                axisLine={{ stroke: 'var(--border)' }}
                tickMargin={8}
                minTickGap={36}
              />
              <YAxis
                orientation={rtl ? 'right' : 'left'}
                tickFormatter={(value) => formatMoneyCompact(value, { currency })}
                tick={CHART_TYPE.tick}
                tickLine={false}
                axisLine={false}
                width={76}
                domain={[(min) => Math.min(min, floor ?? min, 0), 'auto']}
              />
              <Tooltip
                cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const row = payload[0].payload;

                  return (
                    <div
                      dir={dir}
                      className="min-w-44 rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-3 py-2.5 text-xs shadow-(--shadow-overlay)"
                    >
                      <p className="font-medium text-(--color-text-2)">
                        {t('dashboard.home.cash.week')} · {formatDate(row.start)}
                      </p>
                      <p className="tabular mt-1.5 font-semibold text-(--color-text)">
                        {money(row.running)}
                      </p>
                    </div>
                  );
                }}
              />
              <Area
                dataKey="value"
                type="monotone"
                stroke="none"
                fill="url(#cash-area)"
                isAnimationActive={!reducedMotion}
              />
              {floor !== null && (
                <ReferenceLine
                  y={floor}
                  stroke={FLOOR}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  ifOverflow="extendDomain"
                />
              )}
              <Line
                dataKey="value"
                type="monotone"
                stroke={INK}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--surface)', fill: INK }}
                isAnimationActive={!reducedMotion}
                animationDuration={900}
              />
              {lowest && (
                <ReferenceDot
                  x={lowest.label}
                  y={lowest.value}
                  r={6}
                  fill="var(--surface)"
                  stroke={lowest.below || lowest.value < 0 ? FLOOR : INK}
                  strokeWidth={3}
                  label={{
                    value: `${t('dashboard.home.cash.lowest')} ${formatMoneyCompact(lowest.running, { currency })}`,
                    position: 'top',
                    fontSize: 11,
                    fontWeight: 700,
                    fill: lowest.below || lowest.value < 0 ? 'var(--danger)' : 'var(--text)',
                  }}
                />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {!loading && data && (
        <Verdict data={data} hasBalance={hasBalance} floor={floor} canEdit={canEdit} />
      )}
    </section>
  );
}

/** One sentence and, where it helps, one action. Chosen from the forecast's own fields. */
function Verdict({ data, hasBalance, floor, canEdit }) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(false);
  const below = data.below_threshold_weeks ?? [];

  let tone = 'neutral';
  let text;

  if (!hasBalance) {
    text = t('dashboard.home.cash.noBalance');
  } else if (data.first_negative_week) {
    tone = 'danger';
    text = t('dashboard.home.cash.belowZero', { date: formatDate(data.first_negative_week.start) });
  } else if (floor !== null && below.length > 0) {
    tone = 'danger';
    text = t('dashboard.home.cash.belowFloor', {
      count: formatNumber(below.length),
      date: formatDate(data.weeks[below[0]].start),
    });
  } else if (floor !== null) {
    tone = 'safe';
    text = t('dashboard.home.cash.safe');
  } else {
    text = t('dashboard.home.cash.noFloor');
  }

  const offerFloor = canEdit && hasBalance;

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-panel) border border-(--color-line-subtle) bg-(--color-surface-subtle) px-4 py-3.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-[2.125rem] shrink-0 items-center justify-center rounded-(--radius-control)',
            tone === 'danger'
              ? 'bg-(--color-danger-soft) text-(--color-danger)'
              : tone === 'safe'
                ? 'bg-(--color-success-soft) text-(--color-success)'
                : 'bg-(--color-brand-soft) text-(--color-brand-text)',
          )}
        >
          <Icon name={tone === 'danger' ? 'alert' : tone === 'safe' ? 'check' : 'info'} size={18} />
        </span>
        <p className="min-w-0 flex-[1_1_16rem] text-[0.8125rem] leading-relaxed text-(--color-text)">
          {text}
        </p>
        <div className="flex gap-2">
          {offerFloor && !editing && (
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              {t('dashboard.home.cash.setFloor')}
            </Button>
          )}
          <Link
            href="/forecasts"
            className="inline-flex h-9 items-center rounded-(--radius-control) border border-(--color-border) bg-(--color-surface) px-3.5 text-[0.8125rem] font-semibold text-(--color-text) hover:bg-(--color-surface-hover)"
          >
            {t('dashboard.home.cash.details')}
          </Link>
        </div>
      </div>
      {editing && <FloorForm current={data.safety_threshold} onDone={() => setEditing(false)} />}
    </div>
  );
}

function FloorForm({ current, onDone }) {
  const { t } = useI18n();
  const id = useId();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState(current ?? '');

  const save = useMutation({
    mutationFn: forecasts.setCashThreshold,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.forecasts.cash });
      onDone();
    },
  });

  const error = save.error?.errors?.amount?.[0];

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate({ amount: amount === '' ? null : amount });
      }}
    >
      <div className="flex min-w-36 flex-1 flex-col gap-1.5">
        <label htmlFor={`${id}-floor`} className="text-xs font-medium text-(--color-text-2)">
          {t('dashboard.home.cash.floorLabel')}
        </label>
        <MoneyInput
          id={`${id}-floor`}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          invalid={Boolean(error)}
        />
      </div>
      <Button type="submit" variant="primary" size="sm" loading={save.isPending}>
        {t('dashboard.home.cash.save')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onDone}>
        {t('dashboard.home.cash.cancel')}
      </Button>
      {error && (
        <p role="alert" className="w-full text-xs text-(--color-danger)">
          {error}
        </p>
      )}
    </form>
  );
}
