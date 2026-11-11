'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';

/**
 * A new conversation: who this is, and four questions it answers well.
 *
 * The starters are the product's argument in miniature — this month against
 * last, Ramadan against Ramadan, where the money actually came from, what is
 * about to run out — each one a click away from a real answer.
 */
const STARTERS = [
  { key: 'month', icon: 'trendUp' },
  { key: 'ramadan', icon: 'calendar' },
  { key: 'products', icon: 'coins' },
  { key: 'stock', icon: 'shelves' },
];

export function EmptyChat({ onAsk }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const first = String(user?.name ?? '').trim().split(/\s+/)[0];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-10 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-(--color-brand-soft) text-(--color-brand-text)">
        <Logo compact size="lg" />
      </span>
      <h2 className="mt-5 text-xl font-semibold text-(--color-text)">
        {first ? t('assistant.greeting', { name: first }) : t('assistant.greetingAnon')}
      </h2>
      <p className="measure mt-2 text-sm text-(--color-text-2)">{t('assistant.intro')}</p>

      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {STARTERS.map(({ key, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onAsk(t(`assistant.starters.${key}`))}
            className="group flex items-start gap-3 rounded-xl border border-(--border) bg-(--color-surface) p-4 text-start transition-colors hover:border-(--color-brand) hover:bg-(--color-surface-selected)"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--color-brand-soft) text-(--color-brand-text)">
              <Icon name={icon} size={16} aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-(--color-text)">{t(`assistant.starterTitles.${key}`)}</span>
              <span className="mt-0.5 block text-xs text-(--color-text-2)">{t(`assistant.starters.${key}`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
