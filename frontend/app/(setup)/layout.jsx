'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth/AuthProvider';

/**
 * The setup wizard runs signed in, but outside the application shell: there is
 * nothing to navigate to yet, and a sidebar of empty screens would invite the
 * owner to wander off mid-setup (ADR-024).
 */
export default function SetupLayout({ children }) {
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
        <div className="h-12 w-48 rounded-(--radius-control) bg-(--color-surface)" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return <div className="min-h-dvh bg-(--color-ground)">{children}</div>;
}
