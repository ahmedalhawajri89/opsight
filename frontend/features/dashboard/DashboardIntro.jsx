'use client';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatRelative } from '@/lib/format';
import { greeting } from '@/lib/person';

/**
 * The page's heading: a greeting, one plain sentence on what the page is for,
 * and where this period's orders came from with the time of the latest one
 * from each. The sources are the channels the server reported, so a store
 * that sent nothing this period is not shown as if it were live.
 */
export function DashboardIntro({ channels = [] }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const sources = channels.filter((channel) => channel.last_order_at);

  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="text-[1.75rem] leading-tight font-bold tracking-tight text-(--color-text) sm:text-[1.875rem]">
          <span className="sr-only">{t('nav.items.dashboard')} — </span>
          {greeting(t, user?.name)}
        </h1>
        <p className="text-sm text-(--color-text-2)">{t('dashboard.home.subtitle')}</p>
      </div>

      {sources.length > 0 && (
        <ul
          aria-label={t('dashboard.home.sources')}
          className="flex flex-wrap gap-1.5 text-xs text-(--color-text-2)"
        >
          {sources.map((channel) => (
            <li
              key={channel.key}
              className="inline-flex h-7 items-center gap-1.5 rounded-(--radius-pill) border border-(--color-line) bg-(--color-surface) px-2.5"
            >
              <span aria-hidden="true" className="size-1.5 rounded-full bg-(--color-success)" />
              {t(`dashboard.home.channels.${channel.key}`)} ·{' '}
              {t('dashboard.home.lastOrder', { time: formatRelative(channel.last_order_at) })}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
