import { QueryClient } from '@tanstack/react-query';

/**
 * Server-state configuration.
 *
 * Defaults are chosen for an operations tool where figures matter more than
 * network thrift: data goes stale quickly, but a 401 or 403 is never retried
 * because retrying an authorization failure cannot succeed and only delays the
 * user seeing the truth.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: (failureCount, error) => {
          if (error?.status >= 400 && error?.status < 500) return false;

          return failureCount < 1;
        },
      },
      mutations: {
        // A mutation is never retried automatically. Re-sending "confirm this
        // order" would decrement stock twice.
        retry: false,
      },
    },
  });
}
