'use client';

import { LedgerScene } from '@/features/auth/LedgerScene';
import { useI18n } from '@/features/i18n/I18nProvider';
import { FocusColumn } from '@/components/layout/FocusColumn';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';

/**
 * The frame shared by signing in and signing up: light and editorial.
 *
 * The form is at the START edge — the right in Arabic — because whoever comes
 * here comes to type, not to read. At the end edge, on a plain white panel,
 * the product says what it is once and then shows it: records becoming a
 * figure (LedgerScene). No grid, no glow, no coloured wash — the motion is the
 * only ornament, and it is an argument rather than decoration.
 *
 * The two panes carry view-transition names, so switching language lets them
 * glide to their mirrored sides instead of jumping (globals.css, "Language
 * transition").
 */
export function AuthLayout({ title, subtitle, children, footer }) {
  const { t, locale, setPreferences } = useI18n();

  const other = locale === 'ar' ? 'en' : 'ar';
  const otherName = locale === 'ar' ? 'English' : 'العربية';

  return (
    <main className="grid min-h-dvh bg-(--color-ground) lg:grid-cols-[42fr_58fr]">
      {/* ---- The task ---------------------------------------------------- */}
      <section className="order-2 flex flex-col px-6 pb-10 sm:px-8 lg:order-1 lg:py-12 [view-transition-name:login-form]">
        {/*
          Before sign-in there is no account to save to, so this switches the
          page and is remembered in a cookie; the choice stored on the account
          takes over once the reader signs in. It names the language it will
          switch TO, in that language's own script.
        */}
        <FocusColumn className="flex justify-end">
          <button
            type="button"
            onClick={() => setPreferences({ locale: other })}
            aria-label={t('login.switchLanguage', { language: otherName })}
            className="inline-flex h-11 items-center gap-2 rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-4 text-base font-medium text-(--color-text-2) transition-colors duration-(--duration-fast) hover:border-(--color-line-strong) hover:text-(--color-text)"
          >
            <Icon name="globe" size={16} />
            <span lang={other}>{otherName}</span>
          </button>
        </FocusColumn>

        <FocusColumn className="flex flex-1 flex-col justify-center py-8">
          {/* A border, not a shadow: this card sits on the ground, it does not float. */}
          <div className="rise rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-6 sm:p-8">
            <h1 className="text-2xl font-semibold text-(--color-text)">{title}</h1>
            <p className="measure mt-2 text-base text-(--color-text-2)">{subtitle}</p>

            <div className="mt-6">{children}</div>
          </div>

          {footer}
        </FocusColumn>
      </section>

      {/* ---- What it is -------------------------------------------------- */}
      <section className="order-1 px-6 pt-8 pb-2 sm:px-8 lg:order-2 lg:flex lg:items-center lg:py-12 lg:ps-0 lg:pe-12 [view-transition-name:login-scene]">
        <div className="w-full lg:rounded-(--radius-card) lg:border lg:border-(--color-line) lg:bg-(--color-surface) lg:p-12">
          <Logo />

          <p className="mt-6 max-w-xl text-2xl leading-tight font-semibold text-balance text-(--color-text) lg:mt-10 lg:text-3xl">
            {t('login.headline')}
          </p>
          <p className="measure mt-4 hidden text-lg text-(--color-text-2) lg:block">
            {t('common.tagline')}
          </p>

          <div className="hidden lg:block">
            <LedgerScene />
          </div>
        </div>
      </section>
    </main>
  );
}
