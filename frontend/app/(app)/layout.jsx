'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth/AuthProvider';
import { AppShell } from '@/components/layout/AppShell';
import { BootLoader } from '@/components/layout/BootLoader';

/**
 * The authenticated shell. Everything under (app) is protected by it.
 *
 * Protected content never renders for an unknown user, not even for one frame:
 * while status is loading the boot curtain covers the screen, and an unauthenticated user is
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

  /*
   * The first screen has mounted, so its own requests have started (a
   * child's effects run before this one). Until then an idle loader would
   * only mean nothing had been asked for yet.
   */
  const [mounted, setMounted] = useState(false);
  const showShell = !isLoading && isAuthenticated && !needsSetup;

  useEffect(() => {
    if (!showShell) return undefined;

    // A frame later, so the screen's first requests are already in flight.
    const id = window.requestAnimationFrame(() => setMounted(true));

    return () => window.cancelAnimationFrame(id);
  }, [showShell]);

  // Ready when the session is known and, if there is a screen to show, it is
  // up and asking for its data. A visitor on the way to sign in is ready too.
  const ready = !isLoading && (!showShell || mounted);

  return (
    <BootLoader ready={ready}>{showShell ? <AppShell>{children}</AppShell> : null}</BootLoader>
  );
}
