'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth/AuthProvider';

/**
 * Entry point. Routes to the dashboard or the login screen once the session
 * state is known — never guesses before /me has answered.
 */
export default function RootPage() {
  const { isLoading, isAuthenticated } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    router.replace(isAuthenticated ? '/dashboard' : '/login');
  }, [isLoading, isAuthenticated, router]);

  return (
    <div aria-busy="true" className="flex min-h-dvh items-center justify-center">
      <span className="sr-only">Loading Opsight…</span>
    </div>
  );
}
