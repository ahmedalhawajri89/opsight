'use client';

import { gsap } from 'gsap';

import { useI18n } from '@/features/i18n/I18nProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { BaydarMark } from '@/features/assistant/ChatMessage';
import { Icon } from '@/components/ui/Icon';
import { useGsap } from '@/hooks/useGsap';

const STARTERS = [
  { key: 'month', icon: 'trendUp' },
  { key: 'ramadan', icon: 'calendar' },
  { key: 'products', icon: 'coins' },
  { key: 'stock', icon: 'shelves' },
];

/**
 * A new conversation: who is being addressed, what Baydar can answer, and
 * four questions to start from. The mark settles in, the words follow, and
 * the four cards are dealt in one after another; each lifts under the
 * pointer and points its arrow the way the question will go.
 */
export function EmptyChat({ onAsk }) {
  const { t } = useI18n();
  const { user } = useAuth();
  const first = String(user?.name ?? '')
    .trim()
    .split(/\s+/)[0];

  const root = useGsap((self) => {
    const q = self.selector;

    gsap
      .timeline({ defaults: { ease: 'power3.out' } })
      .from(q('[data-empty-mark]'), {
        scale: 0.6,
        autoAlpha: 0,
        duration: 0.6,
        ease: 'back.out(1.8)',
      })
      .from(q('[data-empty-text]'), { y: 10, autoAlpha: 0, duration: 0.45, stagger: 0.08 }, 0.15)
      .from(q('[data-empty-card]'), { y: 16, autoAlpha: 0, duration: 0.45, stagger: 0.07 }, 0.35);
  });

  return (
    <div
      ref={root}
      className="mx-auto flex w-full max-w-2xl flex-col items-center px-4 py-10 text-center"
    >
      <span data-empty-mark className="relative">
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 scale-150 rounded-full bg-[radial-gradient(circle,rgb(227_176_75/0.22),transparent_70%)] blur-md"
        />
        <BaydarMark size={64} className="rounded-2xl" />
      </span>
      <h2 data-empty-text className="mt-5 text-2xl font-bold text-(--color-text)">
        {first ? t('assistant.greeting', { name: first }) : t('assistant.greetingAnon')}
      </h2>
      <p data-empty-text className="measure mt-2 text-sm leading-relaxed text-(--color-text-2)">
        {t('assistant.intro')}
      </p>

      <div className="mt-8 grid w-full gap-3 sm:grid-cols-2">
        {STARTERS.map(({ key, icon }) => (
          <button
            key={key}
            data-empty-card
            type="button"
            onClick={() => onAsk(t(`assistant.starters.${key}`))}
            className="group flex items-center gap-3 rounded-[14px] border border-(--color-line) bg-(--color-surface) p-4 text-start transition-[transform,border-color,box-shadow] duration-200 ease-(--ease-out) hover:-translate-y-0.5 hover:border-(--color-brand-panel) hover:shadow-(--shadow-card) motion-reduce:hover:translate-y-0"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-[11px] bg-(--color-brand-soft) text-(--color-brand-text) transition-colors duration-200 group-hover:bg-(--color-brand-panel) group-hover:text-(--color-accent-on-brand)">
              <Icon name={icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-(--color-text)">
                {t(`assistant.starterTitles.${key}`)}
              </span>
              <span className="mt-0.5 block text-xs text-(--color-text-2)">
                {t(`assistant.starters.${key}`)}
              </span>
            </span>
            <Icon
              name="arrowRight"
              size={15}
              className="shrink-0 text-(--color-muted) opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
            />
          </button>
        ))}
      </div>
    </div>
  );
}
