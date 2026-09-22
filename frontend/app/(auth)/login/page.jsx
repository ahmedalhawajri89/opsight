'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { LoginForm } from '@/features/auth/LoginForm';
import { LedgerScene } from '@/features/auth/LedgerScene';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { FocusColumn } from '@/components/layout/FocusColumn';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';

/**
 * The sign-in screen: light and editorial.
 *
 * The form is at the START edge — the right in Arabic — because a returning
 * user comes here to type, not to read. At the end edge, on a plain white
 * panel, the product says what it is once and then shows it: records becoming
 * a figure (LedgerScene). No grid, no glow, no coloured wash — the motion is
 * the only ornament, and it is an argument rather than decoration.
 *
 * The two panes carry view-transition names, so switching language lets them
 * glide to their mirrored sides instead of jumping (globals.css, "Language
 * transition").
 */
export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { t, locale, setPreferences } = useI18n();
  const router = useRouter();

  // Someone who is already signed in has no business on the login screen.
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

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
            <h1 className="text-2xl font-semibold text-(--color-text)">{t('auth.signIn')}</h1>
            <p className="measure mt-2 text-base text-(--color-text-2)">
              {t('login.formSubtitle')}
            </p>

            <div className="mt-6">
              {isLoading ? (
                <div aria-busy="true" className="space-y-4">
                  <div className="skeleton h-16 rounded-(--radius-control)" />
                  <div className="skeleton h-16 rounded-(--radius-control)" />
                  <div className="skeleton h-11 rounded-(--radius-control)" />
                </div>
              ) : (
                <Suspense fallback={null}>
                  <LoginForm />
                </Suspense>
              )}
            </div>
          </div>

          {/*
            There is no self-service reset in Opsight: an owner creates the
            account and an owner restores it. A "forgot your password?" link
            would have to lead somewhere, so the screen says who to ask instead.
          */}
          <p className="measure mt-4 text-sm text-(--color-muted)">{t('login.help')}</p>
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
