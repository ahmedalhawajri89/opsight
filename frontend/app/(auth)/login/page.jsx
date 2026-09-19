'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { LoginForm } from '@/features/auth/LoginForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';

/**
 * The sign-in screen.
 *
 * Two panes: what this system is, and the way in. The first exists because
 * this is an internal instrument, not a consumer app — the person in front of
 * it was given an account by someone else, and the screen should say what the
 * account is for and what their role will let them see, before they type
 * anything. The second is deliberately plain.
 *
 * Every claim on the left is a property the system actually has: figures
 * computed from source records on request, roles that decide which figures
 * exist at all, and both languages in both directions.
 */
const POINTS = [
  { icon: 'pulse', key: 'computed' },
  { icon: 'userCircle', key: 'roles' },
  { icon: 'globe', key: 'bilingual' },
];

const ROLES = ['owner', 'manager', 'analyst', 'staff'];

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { t, locale, setPreferences } = useI18n();
  const router = useRouter();

  // Someone who is already signed in has no business on the login screen.
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  /*
   * Before sign-in there is no account to save to, so this switches the page
   * and is remembered in a cookie; the choice saved on the account takes over
   * once the reader signs in. Named in the OTHER language's own script, so it
   * is recognisable to the person who needs it.
   */
  const languageSwitch = (
    <button
      type="button"
      onClick={() => setPreferences({ locale: locale === 'ar' ? 'en' : 'ar' })}
      lang={locale === 'ar' ? 'en' : 'ar'}
      className="rounded-(--radius-md) border border-(--color-line) bg-(--color-surface) px-3 py-1.5 text-[0.8125rem] font-medium text-(--color-text-muted) transition-colors duration-(--duration-fast) hover:border-(--color-line-strong) hover:text-(--color-text)"
    >
      {locale === 'ar' ? 'English' : 'العربية'}
    </button>
  );

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.05fr_minmax(26rem,0.95fr)]">
      {/* ---- What this is ------------------------------------------------ */}
      <section className="relative isolate overflow-hidden bg-(--color-accent) px-6 py-8 text-(--color-text-inverse) sm:px-10 sm:py-10 lg:flex lg:flex-col lg:justify-between lg:py-14">
        <BrandCanvas />

        <div className="relative">
          <span className="inline-flex items-center gap-3">
            <Logo compact />
            <span className="text-xl font-bold tracking-tight">{t('common.appName')}</span>
          </span>

          <h1 className="mt-8 max-w-lg text-2xl leading-snug font-semibold text-balance sm:text-[1.75rem] lg:mt-12">
            {t('login.headline')}
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-(--color-text-inverse)/70">
            {t('common.tagline')}
          </p>

          {/*
            Stacked on a phone, this pane sits above the form, so it is kept
            short: the titles carry the point and the sentences return as soon
            as there is room. The sign-in fields matter more than the pitch.
          */}
          <ul className="mt-6 max-w-md space-y-3 sm:mt-8 sm:space-y-4 lg:mt-10">
            {POINTS.map((point) => (
              <li key={point.key} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-text-inverse)/10"
                >
                  <Icon name={point.icon} size={16} strokeWidth={2} />
                </span>
                <span>
                  <span className="block text-[0.8125rem] font-semibold">
                    {t(`login.points.${point.key}.title`)}
                  </span>
                  <span className="mt-0.5 hidden text-[0.8125rem] leading-relaxed text-(--color-text-inverse)/65 sm:block">
                    {t(`login.points.${point.key}.body`)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* The roles, named — an account's role decides what it can even ask for. */}
        <div className="relative mt-10 hidden border-t border-(--color-text-inverse)/15 pt-6 lg:block">
          <p className="text-[0.625rem] font-semibold tracking-[0.1em] text-(--color-text-inverse)/60 uppercase">
            {t('login.roles.title')}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {ROLES.map((role) => (
              <li
                key={role}
                className="rounded-full bg-(--color-text-inverse)/10 px-3 py-1 text-xs font-medium"
              >
                {t(`roles.${role}`)}
              </li>
            ))}
          </ul>
          <p className="mt-3 max-w-md text-xs leading-relaxed text-(--color-text-inverse)/65">
            {t('login.roles.note')}
          </p>
        </div>
      </section>

      {/* ---- The way in -------------------------------------------------- */}
      <section className="flex flex-col bg-(--color-surface) px-6 py-8 sm:px-10 lg:py-10">
        {/* Kept in the form's own column, so it reads as part of this pane. */}
        <div className="mx-auto flex w-full max-w-sm justify-end">{languageSwitch}</div>

        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-10">
          <h2 className="text-xl font-semibold tracking-tight text-(--color-text)">
            {t('auth.signIn')}
          </h2>
          <p className="mt-1.5 text-[0.8125rem] text-(--color-text-muted)">
            {t('login.formSubtitle')}
          </p>

          <div className="mt-7">
            {isLoading ? (
              <div aria-busy="true" className="space-y-5">
                <div className="skeleton h-16 rounded-(--radius-md)" />
                <div className="skeleton h-16 rounded-(--radius-md)" />
                <div className="skeleton h-11 rounded-(--radius-md)" />
              </div>
            ) : (
              <Suspense fallback={null}>
                <LoginForm />
              </Suspense>
            )}
          </div>

          <div className="mt-8 space-y-2 border-t border-(--color-line-subtle) pt-6">
            <p className="text-xs leading-relaxed text-(--color-text-subtle)">
              {t('auth.noSelfRegistration')}
            </p>
            {/* Stated before it happens, because the lockout is real. */}
            <p className="text-xs leading-relaxed text-(--color-text-subtle)">
              {t('login.lockoutNote')}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * The brand pane's backdrop: a faint plotting grid and one rising series.
 *
 * Drawn rather than an image so it scales, themes and mirrors with the page,
 * and costs nothing to load. Decorative, and hidden from assistive technology.
 */
function BrandCanvas() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <svg
        className="absolute inset-0 size-full opacity-[0.16] rtl:-scale-x-100"
        viewBox="0 0 600 700"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        <defs>
          <pattern id="login-grid" width="28" height="28" patternUnits="userSpaceOnUse">
            <path d="M28 0H0V28" stroke="currentColor" strokeWidth="0.6" />
          </pattern>
          <linearGradient id="login-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.5" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* Drawn past the viewBox on every side: a slice never leaves an edge. */}
        <rect x="-200" y="-200" width="1000" height="1100" fill="url(#login-grid)" />
        <path
          d="M-200 590 L80 520 L160 545 L240 430 L320 470 L400 330 L480 360 L800 150 L800 900 L-200 900 Z"
          fill="url(#login-area)"
        />
        <path
          d="M-200 590 L80 520 L160 545 L240 430 L320 470 L400 330 L480 360 L800 150"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>

      {/* A soft light behind the wordmark, so the navy is not flat. */}
      <div className="absolute -top-24 start-[-6rem] size-[26rem] rounded-full bg-(--color-accent-text)/25 blur-3xl" />
    </div>
  );
}
