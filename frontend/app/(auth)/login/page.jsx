'use client';

import { Suspense, useEffect } from 'react';
import { useRouter } from 'next/navigation';

import { LoginForm } from '@/features/auth/LoginForm';
import { useAuth } from '@/features/auth/AuthProvider';

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  // Someone who is already signed in has no business on the login screen.
  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
  }, [isAuthenticated, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-(--color-text)">Opsight</h1>
          <p className="mt-1 text-sm text-(--color-text-muted)">
            Operations &amp; Business Intelligence
          </p>
        </div>

        <div className="rounded-(--radius-md) border border-(--color-line) bg-(--color-surface) p-6">
          {isLoading ? (
            <div aria-busy="true" className="space-y-5">
              <div className="h-14 rounded-(--radius-sm) bg-(--color-surface-sunken)" />
              <div className="h-14 rounded-(--radius-sm) bg-(--color-surface-sunken)" />
              <div className="h-9 rounded-(--radius-sm) bg-(--color-surface-sunken)" />
            </div>
          ) : (
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          )}
        </div>

        <p className="mt-6 text-xs text-(--color-text-subtle)">
          Accounts are created by an owner. Self-registration is disabled.
        </p>
      </div>
    </main>
  );
}
