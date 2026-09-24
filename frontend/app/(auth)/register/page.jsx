'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { RegisterForm } from '@/features/auth/RegisterForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Sign-up: a new business and its owner (ADR-024). Same frame as sign-in.
 */
export default function RegisterPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  // Signing up again while signed in would be a second business by accident.
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  return (
    <AuthLayout
      title={t('register.title')}
      subtitle={t('register.subtitle')}
      footer={
        <p className="measure mt-4 text-sm text-(--color-text-2)">
          {t('register.haveAccount')}{' '}
          <Link
            href="/login"
            className="font-medium text-(--color-brand-text) underline-offset-4 hover:underline"
          >
            {t('auth.signIn')}
          </Link>
        </p>
      }
    >
      {isLoading ? (
        <div aria-busy="true" className="space-y-4">
          <div className="skeleton h-16 rounded-(--radius-control)" />
          <div className="skeleton h-16 rounded-(--radius-control)" />
          <div className="skeleton h-11 rounded-(--radius-control)" />
        </div>
      ) : (
        <RegisterForm />
      )}
    </AuthLayout>
  );
}
