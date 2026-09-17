'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { LoginForm } from '@/features/auth/LoginForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { t, locale, setPreferences } = useI18n();
  const router = useRouter();

  // Someone who is already signed in has no business on the login screen.
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-(--color-text)">
              {t('common.appName')}
            </h1>
            <p className="mt-1 text-sm text-(--color-text-muted)">{t('common.tagline')}</p>
          </div>

          {/*
            Before sign-in there is no account to save to, so this switches the
            page and is remembered in a cookie; the choice saved on the account
            takes over once the reader signs in. Named in the OTHER language's
            own script, so it is recognisable to the person who needs it.
          */}
          <button
            type="button"
            onClick={() => setPreferences({ locale: locale === 'ar' ? 'en' : 'ar' })}
            lang={locale === 'ar' ? 'en' : 'ar'}
            className="shrink-0 rounded-(--radius-sm) border border-(--color-line) bg-(--color-surface) px-2.5 py-1 text-[0.8125rem] text-(--color-text-muted) transition-colors hover:text-(--color-text)"
          >
            {locale === 'ar' ? 'English' : 'العربية'}
          </button>
        </div>

        <div className="rounded-(--radius-md) border border-(--color-line) bg-(--color-surface) p-6">
          {isLoading ? (
            <div aria-busy="true" className="space-y-5">
              <div className="h-14 rounded-(--radius-sm) bg-(--color-surface-sunken)" />
              <div className="h-14 rounded-(--radius-sm) bg-(--color-surface-sunken)" />
              <div className="h-9 rounded-(--radius-sm) bg-(--color-surface-sunken)" />
            </div>
          ) : (
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          )}
        </div>

        <p className="mt-6 text-xs text-(--color-text-subtle)">{t('auth.noSelfRegistration')}</p>
      </div>
    </main>
  );
}
