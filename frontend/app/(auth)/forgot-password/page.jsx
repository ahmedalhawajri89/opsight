'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { ForgotPasswordForm } from '@/features/auth/ForgotPasswordForm';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';

/** Asking for a link to choose a new password. Same frame as sign-in. */
export default function ForgotPasswordPage() {
  const { isAuthenticated } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  // Someone signed in changes their password in their account, not here.
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  return (
    <AuthLayout title={t('reset.forgotTitle')} subtitle={t('reset.forgotSubtitle')}>
      <ForgotPasswordForm />
    </AuthLayout>
  );
}
