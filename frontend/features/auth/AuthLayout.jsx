'use client';

import Link from 'next/link';
import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { AuthHero } from './AuthHero';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';
import { useGsap } from '@/hooks/useGsap';

/**
 * The frame shared by signing in and signing up: a card for the task, and a
 * panel of ink for the argument.
 *
 * FOUR LAYOUTS CAME BEFORE THIS. Two panes; a ledger sheet that scrolled; a
 * clearing in a full screen of ink; and a raised card standing on that ink.
 * The last measured clean and still asked the reader to fill in fields in the
 * dark. This one puts the form on a light card — the same surface every
 * screen inside the product is made of, so the door already looks like the
 * room behind it — and gives the ink its own half, where it can say what the
 * product is without standing behind a password field.
 *
 * SOURCE ORDER IS READING ORDER. The card comes first in the markup and the
 * panel second, so the card is at the START of the line in both languages —
 * left in English, right in Arabic — and a keyboard or a screen reader meets
 * the form before the picture. The panel is an `<aside>`.
 *
 * ONE `h1`, AND IT IS THE FORM'S TITLE. The font test reads the first `h1` in
 * the document and asserts it is drawn in IBM Plex Sans Arabic
 * (e2e/i18n.spec.js), so the welcome on the panel is a paragraph.
 *
 * NOTHING SCROLLS, EXCEPT WHERE IT MUST. `h-dvh` + `overflow-hidden` on the
 * page means no scrollbar at any ordinary size. A 360px phone with the
 * keyboard open has perhaps 300px of usable height, and clipping a password
 * field out of reach is worse than a scrollbar, so the card's column carries
 * its own `overflow-y-auto` as a safety valve.
 *
 * THE FORM NEVER WAITS FOR THE SHOW. The card is in place inside half a
 * second; the panel's picture unfolds afterwards, because nobody is waiting
 * on it. GSAP animates transforms and opacity only, so a field accepts a
 * click while it is still arriving.
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  const { t, locale, setPreferences } = useI18n();

  const other = locale === 'ar' ? 'en' : 'ar';
  const otherName = locale === 'ar' ? 'English' : 'العربية';

  const root = useGsap(
    (self) => {
      const q = self.selector;

      gsap
        .timeline({ defaults: { ease: AUTH_MOTION.card.ease } })
        .from(q('[data-auth-rise]'), {
          duration: AUTH_MOTION.card.duration + 0.2,
          opacity: 0,
          y: 24,
          scale: 0.98,
        })
        .from(
          q('[data-auth-mark]'),
          { opacity: 0, y: -10, scale: 0.8, duration: 0.5, ease: 'back.out(2)' },
          0.1,
        )
        .from(q('[data-auth-bar]'), { scaleX: 0, duration: 0.6, ease: 'power3.inOut' }, 0.25)
        .from(q('[data-auth-foot]'), { opacity: 0, duration: 0.6 }, 0.4);
    },
    [locale],
  );

  return (
    <main
      ref={root}
      className="relative grid h-dvh overflow-hidden bg-(--color-ground) lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] [view-transition-name:login-form]"
    >
      {/*
        Before sign-in there is no account to save to, so this switches the
        page and is remembered in a cookie; the choice stored on the account
        takes over once the reader signs in. It names the language it will
        switch TO, in that language's own script. At the end of the line it
        stands on the ink panel, so on a wide screen it takes the panel's
        colours; on a phone it is on the light ground.
      */}
      <button
        type="button"
        onClick={() => setPreferences({ locale: other })}
        aria-label={t('login.switchLanguage', { language: otherName })}
        className="absolute top-5 end-5 z-20 inline-flex h-11 items-center gap-2 rounded-(--radius-pill) border border-(--color-line) bg-(--color-surface) px-4 text-sm font-semibold text-(--color-text) shadow-(--shadow-card) transition-colors duration-(--duration-fast) hover:border-(--color-brand) lg:end-8 lg:top-7 lg:border-(--color-on-brand-line)/35 lg:bg-(--color-brand-panel-deep)/70 lg:text-(--color-on-brand) lg:shadow-none lg:backdrop-blur lg:hover:border-(--color-accent-on-brand) lg:hover:bg-(--color-brand-panel-deep)"
      >
        <Icon name="globe" size={16} />
        <span lang={other}>{otherName}</span>
      </button>

      {/*
        The column. Its own scroll is the safety valve described above; the
        vertical padding keeps a focused field's ring clear of its clipped
        edge.
      */}
      <div className="relative z-10 flex max-h-dvh min-h-0 flex-col items-center overflow-y-auto px-5 py-8 sm:px-8 [@media(max-height:680px)]:py-4">
        <div className="my-auto w-full max-w-md">
          <section
            data-auth-rise
            className="rounded-(--radius-auth) border border-(--color-line-subtle) bg-(--color-surface) px-6 py-8 shadow-(--shadow-auth) sm:px-9 sm:py-9 [@media(max-height:760px)]:py-6"
          >
            <div className="flex flex-col items-center text-center">
              <span data-auth-mark>
                <Logo size="lg" />
              </span>

              <h1 className="mt-5 text-2xl font-bold tracking-tight text-(--color-text) [@media(max-height:760px)]:mt-3">
                {title}
              </h1>
              <p className="mt-1.5 text-base text-(--color-muted)">{subtitle}</p>
              <span
                data-auth-bar
                aria-hidden="true"
                className="mt-4 h-1 w-14 rounded-(--radius-pill) bg-(--color-accent-on-brand)"
              />
            </div>

            <div className="mt-6 [@media(max-height:760px)]:mt-4">{children}</div>
          </section>

          {/* Links out: below the card, because they are not the task. */}
          <div data-auth-foot className="mt-5 text-center">
            {footer}
          </div>

          <p
            data-auth-foot
            className="mt-5 flex items-center justify-center gap-2 text-xs text-(--color-muted)"
          >
            <Icon name="shield" size={14} className="shrink-0" />
            <span>
              {t('login.copyright', { year: new Date().getFullYear(), name: t('common.appName') })}
            </span>
            <span aria-hidden="true">·</span>
            <Link
              href="/privacy"
              className="underline-offset-4 hover:text-(--color-text) hover:underline"
            >
              {t('privacy.title')}
            </Link>
          </p>
        </div>
      </div>

      <AuthHero />
    </main>
  );
}
