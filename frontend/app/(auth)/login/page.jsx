'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { LoginForm } from '@/features/auth/LoginForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { FocusColumn } from '@/components/layout/FocusColumn';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';

/**
 * The sign-in screen: the focus template beside the one identity panel in the
 * product.
 *
 * The form is at the START edge — the right in Arabic — because a returning
 * user comes here to type, not to read, and the task should be under the
 * cursor before the story is. The panel is at the end edge, and it is the only
 * place in Opsight where a full brand wash and a background pattern are
 * allowed; application screens carry no decoration at all.
 *
 * Nothing on this page states a figure. Nobody is signed in, so there is no
 * data to state, and an invented number on the door of an analytics product is
 * a lie about the first thing it claims to do.
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
    <main className="grid min-h-dvh lg:grid-cols-[42fr_58fr]">
      {/* ---- The task ---------------------------------------------------- */}
      <section className="order-2 flex flex-col bg-(--color-ground) px-6 py-8 sm:px-8 lg:order-1 lg:py-12">
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
          <div className="rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-6 sm:p-8">
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
      <section className="relative order-1 isolate overflow-hidden bg-(--color-brand) px-6 py-10 text-(--color-text-inverse) sm:px-12 lg:order-2 lg:flex lg:flex-col lg:justify-center lg:py-14">
        <BrandCanvas />

        <div className="relative">
          <span className="inline-flex items-center gap-3">
            <Logo compact />
            <span className="text-xl font-bold tracking-tight">{t('common.appName')}</span>
          </span>

          <p className="mt-8 max-w-xl text-2xl leading-tight font-semibold text-balance lg:mt-12 lg:text-3xl">
            {t('login.headline')}
          </p>
          <p className="measure mt-4 hidden text-lg text-(--color-text-inverse)/70 lg:block">
            {t('common.tagline')}
          </p>

          <ProductGlimpse />
        </div>
      </section>
    </main>
  );
}

/**
 * The panel's backdrop: a plotting grid at very low contrast.
 *
 * Drawn rather than loaded, so it scales and mirrors with the page and costs
 * nothing. Decorative, and hidden from assistive technology.
 */
function BrandCanvas() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg className="absolute inset-0 size-full opacity-[0.07]" fill="none">
        <defs>
          <pattern id="login-grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M32 0H0V32" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#login-grid)" />
      </svg>

      {/* A soft light behind the wordmark, so the navy is not flat. */}
      <div className="absolute -top-24 start-[-8rem] size-104 rounded-full bg-(--color-brand-text)/25 blur-3xl" />
    </div>
  );
}

/**
 * A glimpse of the product: a line that climbs, with the accent marking where
 * it has reached.
 *
 * It carries no axis, no scale and no figure, because it is not showing anyone
 * anything. It is NOT mirrored in Arabic: every real chart in Opsight draws
 * its time axis left to right — the drawing surface is forced to `dir="ltr"`
 * because SVG text anchoring flips with the page — so a glimpse that ran the
 * other way would be a picture of a product that does not exist.
 */
function ProductGlimpse() {
  return (
    <div
      aria-hidden="true"
      className="mt-10 hidden max-w-lg rounded-(--radius-card) border border-(--color-text-inverse)/15 bg-(--color-text-inverse)/5 p-6 lg:block"
    >
      <div className="flex items-center gap-2">
        <span className="size-2 rounded-(--radius-pill) bg-(--color-accent)" />
        <span className="h-2 w-20 rounded-(--radius-pill) bg-(--color-text-inverse)/25" />
      </div>

      <svg viewBox="0 0 320 96" fill="none" dir="ltr" className="mt-5 h-24 w-full">
        <defs>
          <linearGradient id="glimpse-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d="M0 78 L53 68 L107 72 L160 48 L213 54 L267 28 L320 14 L320 96 L0 96 Z"
          fill="url(#glimpse-fill)"
        />
        <path
          d="M0 78 L53 68 L107 72 L160 48 L213 54 L267 28 L320 14"
          stroke="currentColor"
          strokeOpacity="0.55"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="320" cy="14" r="5" className="fill-(--color-accent)" />
      </svg>
    </div>
  );
}
