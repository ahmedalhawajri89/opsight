'use client';

import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';

import { AuthProvider } from '@/features/auth/AuthProvider';
import { createQueryClient } from '@/lib/queryClient';

export function Providers({ children }) {
  // Created in state, not at module scope, so each browser session gets its own
  // cache and nothing leaks between users during development hot reloads.
  const [queryClient] = useState(createQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
