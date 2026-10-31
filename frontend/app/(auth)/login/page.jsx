'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { DemoAccounts, IS_DEMO } from '@/features/auth/DemoAccounts';
import { LoginForm } from '@/features/auth/LoginForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * The sign-in screen. The frame is shared with sign-up (AuthLayout).
 */
export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  // Someone who is already signed in has no business on the login screen.
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  return (
    <AuthLayout
      title={t('auth.signIn')}
      subtitle={t('login.formSubtitle')}
      footer={
        <div className="measure mt-4 space-y-2 text-sm">
          {/*
            Two different people arrive here without an account: an owner whose
            business is not on Opsight yet, who can sign it up, and a member of
            staff, whose account an owner creates. Each is told what to do.
          */}
          <p className="text-(--color-text-2)">
            {t('login.newBusiness')}{' '}
            <Link
              href="/register"
              className="font-medium text-(--color-brand-text) underline-offset-4 hover:underline"
            >
              {t('login.createBusiness')}
            </Link>
          </p>
          <p className="text-(--color-muted)">
            {t('login.help')}{' '}
            {/* Readable without an account, which is the point of it. */}
            <Link href="/privacy" className="underline-offset-4 hover:underline">
              {t('privacy.title')}
            </Link>
          </p>
        </div>
      }
    >
      {isLoading ? (
        <div aria-busy="true" className="space-y-4">
          <div className="skeleton h-16 rounded-(--radius-control)" />
          <div className="skeleton h-16 rounded-(--radius-control)" />
          <div className="skeleton h-11 rounded-(--radius-control)" />
        </div>
      ) : (
        <Suspense fallback={null}>
          <DemoAccounts />
          <EmailSignIn />
        </Suspense>
      )}
    </AuthLayout>
  );
}

/**
 * The real form — shown outright, or folded away on the public demo.
 *
 * On the demo the one-click roles are the point, and a full email form under
 * them gave a visitor two complete paths and no reason to prefer either. On
 * every other build there are no shortcuts to compete with, so the form is
 * the page and a disclosure in front of it would be a click charged to
 * everyone who signs in each morning.
 *
 * `IS_DEMO` is inlined at build time, so the initial state is the same on the
 * server and in the browser and there is nothing for hydration to disagree
 * about. Revealing it mounts the form fresh, which means its own autofocus
 * puts the cursor in the email field — the disclosure costs a click, not a
 * click and a reach for the mouse.
 */
function EmailSignIn() {
  const { t } = useI18n();
  const [shown, setShown] = useState(!IS_DEMO);

  if (shown) return <LoginForm />;

  return (
    <button
      type="button"
      onClick={() => setShown(true)}
      className="flex h-11 w-full items-center justify-center rounded-(--radius-control) border border-(--color-line-strong) bg-(--color-surface) px-4 text-sm font-medium text-(--color-text) transition-colors duration-(--duration-fast) hover:border-(--color-brand)"
    >
      {t('login.emailInstead')}
    </button>
  );
}
