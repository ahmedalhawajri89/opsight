'use client';

import Link from 'next/link';

import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { EMPTY, formatDate, formatNumber } from '@/lib/format';

const SHOWN = 5;

/* The stock forecast's own verdicts, each with one tone. */
const TONE = {
  out: {
    bar: 'bg-(--color-danger)',
    text: 'text-(--color-danger)',
    tag: 'bg-(--color-danger-soft)',
  },
  order_now: {
    bar: 'bg-(--color-danger)',
    text: 'text-(--color-danger)',
    tag: 'bg-(--color-danger-soft)',
  },
  soon: {
    bar: 'bg-(--color-warning)',
    text: 'text-(--color-warning)',
    tag: 'bg-(--color-warning-soft)',
  },
  ok: {
    bar: 'bg-(--color-chart-ink-2)',
    text: 'text-(--color-brand-text)',
    tag: 'bg-(--color-brand-soft)',
  },
};

/**
 * "When will stock run out?": the five products closest to running out, at
 * the rate they sold over the last thirty days.
 *
 * Days left, the run-out date and the verdict are the stock forecast's. The
 * bar is how much of the forecast's cover window (`cover_days`) the stock on
 * hand would last: a position on the page, not a figure. Products that have
 * not sold have no run-out date and are listed after the ones that will.
 */
export function StockRunway({ data, loading, className }) {
  const { t } = useI18n();
  const cover = data?.cover_days || 30;

  const items = [...(data?.items ?? [])]
    .sort((a, b) => (a.days_left ?? Infinity) - (b.days_left ?? Infinity))
    .slice(0, SHOWN);

  return (
    <section
      aria-labelledby="stock-title"
      className={cn(
        'flex min-w-0 flex-col gap-3.5 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) px-6 py-5',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="stock-title" className="text-[1.0625rem] font-bold text-(--color-text)">
            {t('dashboard.home.stock.title')}
          </h2>
          <p className="text-xs text-(--color-text-2)">{t('dashboard.home.stock.subtitle')}</p>
        </div>
        <Link
          href="/forecasts"
          className="inline-flex min-h-8 items-center text-[0.8125rem] font-semibold text-(--color-brand-text) hover:underline"
        >
          {t('dashboard.home.stock.all')}
        </Link>
      </div>

      {loading ? (
        <div aria-hidden="true" className="skeleton h-56 rounded-(--radius-panel)" />
      ) : items.length === 0 ? (
        <p className="text-sm text-(--color-text-2)">{t('dashboard.home.stock.empty')}</p>
      ) : (
        <div className="overflow-x-auto rounded-(--radius-panel) border border-(--color-line-subtle)">
          <table className="w-full min-w-[38rem] border-collapse text-[0.8125rem]">
            <thead>
              <tr className="bg-(--color-surface-subtle) text-xs text-(--color-text-2)">
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('dashboard.home.stock.product')}
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  {t('dashboard.home.stock.left')}
                </th>
                <th scope="col" className="px-3 py-2.5 text-start font-medium">
                  {t('dashboard.home.stock.rate')}
                </th>
                <th scope="col" className="w-[32%] px-3 py-2.5 text-start font-medium">
                  {t('dashboard.home.stock.cover')}
                </th>
                <th scope="col" className="px-4 py-2.5 text-start font-medium">
                  {t('dashboard.home.stock.runOut')}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const tone = TONE[item.status] ?? TONE.ok;
                const days = item.days_left;
                const width =
                  days === null || days === undefined
                    ? 0
                    : Math.min(100, Math.max(3, (days / cover) * 100));

                return (
                  <tr key={item.product_id}>
                    <td className="border-t border-(--color-line-subtle) px-4 py-3 font-semibold text-(--color-text)">
                      <span style={{ unicodeBidi: 'plaintext' }}>{item.name}</span>
                    </td>
                    <td className="tabular border-t border-(--color-line-subtle) px-3 py-3">
                      {formatNumber(item.stock)}
                    </td>
                    <td className="tabular border-t border-(--color-line-subtle) px-3 py-3 text-(--color-text-2)">
                      {formatNumber(item.daily_rate, { decimals: 1 })}
                    </td>
                    <td className="border-t border-(--color-line-subtle) px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <div
                          aria-hidden="true"
                          className="h-1.5 flex-1 rounded-full bg-(--color-surface-hover)"
                        >
                          <div
                            className={cn('h-1.5 rounded-full', tone.bar)}
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className={cn('min-w-14 text-xs font-semibold', tone.text)}>
                          {days === null || days === undefined
                            ? t('dashboard.home.stock.noSales')
                            : days < 1
                              ? t('dashboard.home.stock.outNow')
                              : t('dashboard.home.stock.days', { count: Math.round(days) })}
                        </span>
                      </div>
                    </td>
                    <td className="border-t border-(--color-line-subtle) px-4 py-3">
                      {item.run_out_on ? (
                        <span
                          className={cn(
                            'rounded-(--radius-control) px-2 py-0.5 text-xs font-semibold',
                            tone.tag,
                            tone.text,
                          )}
                        >
                          {formatDate(item.run_out_on)}
                        </span>
                      ) : (
                        EMPTY
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
