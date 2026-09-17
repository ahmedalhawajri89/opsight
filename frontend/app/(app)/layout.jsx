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
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div aria-busy="true" className="min-h-dvh p-6">
        <div className="h-12 w-48 rounded-(--radius-sm) bg-(--color-surface)" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <AppShell>{children}</AppShell>;
}
