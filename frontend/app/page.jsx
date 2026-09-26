'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Entry point. Routes to the dashboard or the login screen once the session
 * state is known — never guesses before /me has answered.
 */
export default function RootPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    router.replace(isAuthenticated ? '/dashboard' : '/login');
  }, [isLoading, isAuthenticated, router]);

  return (
    <div aria-busy="true" className="flex min-h-dvh items-center justify-center">
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}
