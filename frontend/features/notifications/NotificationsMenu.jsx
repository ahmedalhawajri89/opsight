'use client';

import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Popover';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useInsights } from '@/features/insights/useInsights';
import { cn } from '@/lib/cn';

/**
 * The bell: the key changes the rules found, reachable from every screen.
 *
 * There is no separate notification system — nothing in Opsight pushes
 * messages — so the bell shows exactly what the dashboard's key changes show,
 * for the default window (the last 30 days against the 30 before). The dot
 * means "there is at least one finding", and the button's name says how many,
 * so the dot is never the only carrier of that fact.
 *
 * It asks the server only when opened. The dot reads whatever the dashboard
 * already fetched for the same window — the same query, from the cache — so
 * moving between screens costs no analytics request, which is the most
 * expensive and most tightly rate-limited work the API does.
 */
const DEFAULT_PERIOD = { preset: '30d', comparison: 'previous_period' };

const TONES = {
  warning: 'bg-(--color-warning-subtle) text-(--color-warning)',
  action: 'bg-(--color-negative-subtle) text-(--color-negative)',
  positive: 'bg-(--color-positive-subtle) text-(--color-positive)',
  opportunity: 'bg-(--color-info-subtle) text-(--color-info)',
  data_quality: 'bg-(--color-surface-hover) text-(--color-text-muted)',
};

const ICONS = {
  warning: 'alert',
  action: 'arrowDown',
  positive: 'arrowUp',
  opportunity: 'star',
  data_quality: 'database',
};

export function NotificationsMenu() {
  const { t } = useI18n();
  const { insights: cached } = useInsights(DEFAULT_PERIOD, { enabled: false });
  const count = cached.length;

  return (
    <Popover
      panelClassName="w-[min(22rem,calc(100vw-2rem))]"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={t('notifications.label', { count })}
          className="relative inline-flex size-9 items-center justify-center rounded-(--radius-md) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-hover) hover:text-(--color-text)"
        >
          <Icon name="bell" size={20} />
          {count > 0 && (
            <span
              aria-hidden="true"
              className="absolute end-2 top-1.5 size-2 rounded-full bg-(--color-negative) ring-2 ring-(--color-surface)"
            />
          )}
        </button>
      )}
    >
      {({ close }) => <BellPanel close={close} />}
    </Popover>
  );
}

function BellPanel({ close }) {
  const { t } = useI18n();
  const { insights, isLoading } = useInsights(DEFAULT_PERIOD);
  const count = insights.length;

  return (
    <div>
      <div className="flex items-center justify-between border-b border-(--color-line-subtle) px-4 py-3">
        <p className="text-sm font-semibold text-(--color-text)">{t('notifications.title')}</p>
        <span className="text-xs text-(--color-text-subtle)">{t('notifications.window')}</span>
      </div>

      {isLoading ? (
        <p className="px-4 py-6 text-sm text-(--color-text-muted)">{t('search.searching')}</p>
      ) : count === 0 ? (
        <p className="px-4 py-6 text-sm text-(--color-text-muted)">{t('notifications.empty')}</p>
      ) : (
        <ul className="max-h-96 divide-y divide-(--color-line-subtle) overflow-y-auto">
          {insights.map((insight) => (
            <li key={insight.id} className="flex gap-3 px-4 py-3">
              <span
                aria-hidden="true"
                className={cn(
                  'inline-flex size-8 shrink-0 items-center justify-center rounded-full',
                  TONES[insight.severity] ?? TONES.warning,
                )}
              >
                <Icon name={ICONS[insight.severity] ?? 'alert'} size={15} strokeWidth={2.25} />
              </span>
              <div className="min-w-0">
                <p className="text-[0.8125rem] font-semibold text-(--color-text)">
                  {insight.title}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-(--color-text-muted)">
                  {insight.message}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-(--color-line-subtle) px-4 py-2.5">
        <Link
          href="/dashboard"
          onClick={close}
          className="text-[0.8125rem] font-medium text-(--color-accent-text) hover:underline"
        >
          {t('notifications.viewAll')}
        </Link>
      </div>
    </div>
  );
}
