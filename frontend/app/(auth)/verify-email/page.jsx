'use client';

import { Suspense } from 'react';

import { AuthLayout } from '@/features/auth/AuthLayout';
import { VerifyEmail } from '@/features/auth/VerifyEmail';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Where the link in a confirmation email lands. It reads the link from the
 * query string, so it renders inside a Suspense boundary, and it is open
 * whether or not anyone is signed in on this device.
 */
export default function VerifyEmailPage() {
  const { t } = useI18n();

  return (
    <AuthLayout title={t('verify.title')} subtitle={t('verify.subtitle')}>
      <Suspense fallback={null}>
        <VerifyEmail />
      </Suspense>
    </AuthLayout>
  );
}
