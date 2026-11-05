'use client';

import { Suspense } from 'react';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { ResetPasswordForm } from '@/features/auth/ResetPasswordForm';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * A new password from the emailed link. The form reads the token and address
 * from the query string, so it renders inside a Suspense boundary.
 *
 * Not redirected away when signed in: someone may open the link on a device
 * where another account is signed in, and the link is still theirs to use.
 */
export default function ResetPasswordPage() {
  const { t } = useI18n();

  return (
    <AuthLayout title={t('reset.title')} subtitle={t('reset.subtitle')}>
      <Suspense fallback={null}>
        <ResetPasswordForm />
      </Suspense>
    </AuthLayout>
  );
}
