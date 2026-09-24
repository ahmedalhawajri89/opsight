'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';

/**
 * The authenticated shell. Everything under (app) is protected by it.
 *
 * Protected content never renders for an unknown user, not even for one frame:
 * while status is loading we render a skeleton, and an unauthenticated user is
 * redirected before any child mounts.
 */
export default function AuthenticatedLayout({ children }) {
  const { isLoading, isAuthenticated, user, can } = useAuth();
  const router = useRouter();

  /*
   * A business whose owner has not finished setup is sent back to the wizard
   * (ADR-024): until the currency and the working week are settled, every
   * figure on every screen would be stated in the wrong terms. Only the owner
   * can finish it, so nobody else is redirected into a screen they cannot use.
   */
  const needsSetup =
    isAuthenticated && user?.business?.onboarded === false && can('settings.update');

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      router.replace('/login');

      return;
    }

    if (needsSetup) {
      router.replace('/onboarding');
    }
  }, [isLoading, isAuthenticated, needsSetup, router]);

  if (isLoading) {
    return (
      <div aria-busy="true" className="min-h-dvh p-6">
        <div className="h-12 w-48 rounded-(--radius-control) bg-(--color-surface)" />
      </div>
    );
  }

  if (!isAuthenticated || needsSetup) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
