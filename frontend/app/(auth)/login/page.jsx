'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthLayout } from '@/features/auth/AuthLayout';
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
          <p className="text-(--color-muted)">{t('login.help')}</p>
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
          <LoginForm />
        </Suspense>
      )}
    </AuthLayout>
  );
}
