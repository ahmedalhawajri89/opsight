'use client';

import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { formatMoney, formatMoneyCompact, formatNumber } from '@/lib/format';

const BAR_HEIGHT = 172;

/**
 * "Did you actually make a profit?": revenue, less cost of goods, less
 * operating expenses, equals net profit. Four bars, the two in the middle
 * floating where the money left, so the eye follows the sum.
 *
 * Every amount is the server's (net_revenue, cogs, operating_expenses,
 * net_profit). The bars only scale those amounts to a height; the floating
 * offsets are positions on the page, not figures anyone reads. Each bar
 * carries its signed amount in words, so colour is never the only signal.
 *
 * Below, the largest expense categories for the period, with any remainder
 * folded into one "other" row so the list still adds up to the whole.
 */
export function ProfitBreakdown({ metrics, expenses, currency, decimals, loading, className }) {
  const { t } = useI18n();
  const money = (value, sign) => formatMoney(value, { currency, decimals, sign });
  const compact = (value) => formatMoneyCompact(value, { currency });

  const revenue = Number(metrics?.net_revenue?.value);
  const cogs = Number(metrics?.cogs?.value);
  const opex = Number(metrics?.operating_expenses?.value);
  const profit = Number(metrics?.net_profit?.value);
  const ready = [revenue, cogs, opex, profit].every(Number.isFinite);

  // The tallest thing on the chart sets the scale: revenue, or the costs if
  // they ran past it in a losing period.
  const top = ready ? Math.max(revenue, cogs + opex, Math.abs(profit), 1) : 1;
  const px = (value) => Math.max(2, (Math.abs(value) / top) * BAR_HEIGHT);
  const loss = ready && profit < 0;

  const bars = ready
    ? [
        {
          key: 'revenue',
          label: t('dashboard.home.profit.revenue'),
          value: metrics.net_revenue.value,
          height: px(revenue),
          lift: 0,
          tone: 'bg-(--color-chart-ink)',
          sign: false,
        },
        {
          key: 'cost',
          label: t('dashboard.home.profit.cost'),
          value: metrics.cogs.value,
          height: px(cogs),
          lift: Math.max(0, px(revenue) - px(cogs)),
          tone: 'bg-(--color-chart-cost)',
          sign: true,
        },
        {
          key: 'expenses',
          label: t('dashboard.home.profit.expenses'),
          value: metrics.operating_expenses.value,
          height: px(opex),
          lift: Math.max(0, px(revenue) - px(cogs) - px(opex)),
          tone: 'bg-(--color-chart-expense)',
          sign: true,
        },
        {
          key: 'profit',
          label: loss ? t('dashboard.home.profit.loss') : t('dashboard.home.profit.profit'),
          value: metrics.net_profit.value,
          height: px(profit),
          lift: 0,
          tone: loss ? 'bg-(--color-danger)' : 'bg-(--color-chart-profit)',
          sign: false,
          emphasis: true,
        },
      ]
    : [];

  return (
    <section
      aria-labelledby="profit-title"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) px-6 py-5',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 id="profit-title" className="text-[1.0625rem] font-bold text-(--color-text)">
          {t('dashboard.home.profit.title')}
        </h2>
        <p className="text-xs text-(--color-text-2)">{t('dashboard.home.profit.subtitle')}</p>
      </div>

      {loading || !ready ? (
        <div aria-hidden="true" className="skeleton h-52 rounded-(--radius-panel)" />
      ) : (
        <figure className="m-0">
          <div
            className="flex items-end gap-3.5 border-b border-(--color-border) px-1"
            style={{ height: BAR_HEIGHT + 28 }}
          >
            {bars.map((bar) => (
              <div key={bar.key} className="flex h-full min-w-0 flex-1 flex-col justify-end">
                <span
                  className={cn(
                    'tabular mb-1.5 text-center text-[0.6875rem] font-semibold',
                    bar.emphasis
                      ? loss
                        ? 'text-(--color-danger)'
                        : 'text-(--color-accent)'
                      : bar.sign
                        ? 'text-(--color-text-2)'
                        : 'text-(--color-text)',
                  )}
                >
                  <bdi>{compact(bar.sign ? -Number(bar.value) : bar.value)}</bdi>
                </span>
                <div
                  data-profit-bar
                  className={cn(
                    'origin-bottom',
                    bar.tone,
                    bar.lift ? 'rounded-[4px]' : 'rounded-t-[6px]',
                  )}
                  style={{ height: bar.height }}
                />
                <div style={{ height: bar.lift }} />
              </div>
            ))}
          </div>
          <figcaption className="mt-2 flex gap-3.5 px-1 text-center text-[0.6875rem] text-(--color-text-2)">
            {bars.map((bar) => (
              <span
                key={bar.key}
                className={cn('flex-1', bar.emphasis && 'font-semibold text-(--color-text)')}
              >
                {bar.label}
              </span>
            ))}
          </figcaption>

          {/* The same four amounts, exact, for anyone who will not read a bar. */}
          <dl className="sr-only">
            {bars.map((bar) => (
              <div key={bar.key}>
                <dt>{bar.label}</dt>
                <dd>{bar.sign ? money(-Number(bar.value), true) : money(bar.value)}</dd>
              </div>
            ))}
          </dl>
        </figure>
      )}

      {!loading && ready && (
        <ul className="flex flex-col text-[0.8125rem]">
          {(expenses?.rows ?? []).length === 0 ? (
            <li className="border-t border-(--color-line-subtle) py-2.5 text-(--color-text-2)">
              {t('dashboard.home.profit.noExpenses')}
            </li>
          ) : (
            expenses.rows.map((row) => (
              <li
                key={row.is_other ? 'other' : row.label}
                className="flex items-center justify-between gap-3 border-t border-(--color-line-subtle) py-2.5"
              >
                <span
                  className="min-w-0 truncate text-(--color-text-2)"
                  style={{ unicodeBidi: 'plaintext' }}
                >
                  {row.is_other
                    ? t('dashboard.home.profit.otherCategories', { count: formatNumber(row.count) })
                    : row.label}
                </span>
                <span className="tabular font-semibold text-(--color-text)">
                  {money(row.value)}
                </span>
              </li>
            ))
          )}
        </ul>
      )}

      <Link
        href="/analytics"
        className="mt-auto inline-flex min-h-8 items-center gap-1 self-start text-[0.8125rem] font-semibold text-(--color-brand-text) hover:underline"
      >
        {t('dashboard.home.profit.how')}
        <Icon name="arrowRight" size={14} className="rtl:-scale-x-100" />
      </Link>
    </section>
  );
}
