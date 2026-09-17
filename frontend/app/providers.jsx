'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { I18nProvider } from '@/features/i18n/I18nProvider';
import { createQueryClient } from '@/lib/queryClient';

export function Providers({ initialLocale, initialNumerals, children }) {
  // Created in state, not at module scope, so each browser session gets its own
  // cache and nothing leaks between users during development hot reloads.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {/* Inside auth: the signed-in user's saved language is the authority. */}
        <I18nProvider initialLocale={initialLocale} initialNumerals={initialNumerals}>
          {children}
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
