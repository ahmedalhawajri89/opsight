'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { formatMoney, formatPercent } from '@/lib/format';

/* One hue per channel, in the order the design ranks them. */
const COLOURS = [
  'var(--chart-ink)',
  'var(--chart-ink-2)',
  'var(--chart-profit)',
  'var(--chart-expense)',
];

/**
 * Sales by where the order came from: Salla, Zid, a file import, or typed in
 * by hand. A strip of shares, then one row per channel.
 *
 * Shares, revenue and margins are all the server's (`data.channels`). A role
 * without cost receives no margin and sees no margin. The closing sentence
 * names the channel with the highest margin, picked from the rows, not
 * computed.
 */
export function ChannelMix({ channels = [], canSeeCost, currency, decimals, loading, className }) {
  const { t } = useI18n();
  const money = (value) => formatMoney(value, { currency, decimals });
  const total = channels.reduce((sum, channel) => sum + channel.orders, 0);
  const name = (key) => t(`dashboard.home.channels.${key}`, {}) ?? key;

  const withMargin = canSeeCost
    ? channels.filter(
        (channel) => channel.gross_margin !== null && channel.gross_margin !== undefined,
      )
    : [];
  const best =
    withMargin.length > 1
      ? withMargin.reduce((top, channel) =>
          channel.gross_margin > top.gross_margin ? channel : top,
        )
      : null;

  return (
    <section
      aria-labelledby="channels-title"
      className={cn(
        'flex min-w-0 flex-col gap-4 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) px-6 py-5',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 id="channels-title" className="text-[1.0625rem] font-bold text-(--color-text)">
          {canSeeCost
            ? t('dashboard.home.channelsCard.title')
            : t('dashboard.home.channelsCard.titleSales')}
        </h2>
        <p className="text-xs text-(--color-text-2)">
          {t('dashboard.home.channelsCard.subtitle')}
          {total > 0 && <> · {t('dashboard.home.channelsCard.orders', { count: total })}</>}
        </p>
      </div>

      {loading ? (
        <div aria-hidden="true" className="skeleton h-40 rounded-(--radius-panel)" />
      ) : channels.length === 0 ? (
        <p className="text-sm text-(--color-text-2)">{t('dashboard.home.channelsCard.empty')}</p>
      ) : (
        <>
          <div aria-hidden="true" className="flex h-3 gap-0.5 overflow-hidden rounded-[4px]">
            {channels.map((channel, index) => (
              <div
                key={channel.key}
                style={{
                  width: `${(channel.share ?? 0) * 100}%`,
                  background: COLOURS[index % COLOURS.length],
                }}
              />
            ))}
          </div>

          <ul className="flex flex-col">
            {channels.map((channel, index) => (
              <li
                key={channel.key}
                className="flex items-center gap-2.5 border-t border-(--color-line-subtle) py-[0.6875rem]"
              >
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: COLOURS[index % COLOURS.length] }}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold text-(--color-text)">
                    {name(channel.key)}
                  </span>
                  <span className="text-[0.6875rem] text-(--color-text-2)">
                    {t('dashboard.home.channelsCard.orders', { count: channel.orders })}
                    {channel.share !== null && <> · {formatPercent(channel.share)}</>}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className="tabular text-sm font-semibold text-(--color-text)">
                    {money(channel.revenue)}
                  </span>
                  {canSeeCost &&
                    channel.gross_margin !== null &&
                    channel.gross_margin !== undefined && (
                      <span className="text-[0.6875rem] text-(--color-text-2)">
                        {t('dashboard.home.channelsCard.margin', {
                          value: formatPercent(channel.gross_margin),
                        })}
                      </span>
                    )}
                </span>
              </li>
            ))}
          </ul>

          {best && (
            <p className="mt-auto rounded-(--radius-panel) bg-(--color-accent-soft) px-3.5 py-3 text-xs leading-relaxed text-(--color-text)">
              {t('dashboard.home.channelsCard.best', {
                channel: name(best.key),
                value: formatPercent(best.gross_margin),
              })}
            </p>
          )}
        </>
      )}
    </section>
  );
}
