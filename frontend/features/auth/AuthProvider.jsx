'use client';

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { SESSION_EXPIRED_EVENT } from '@/lib/apiClient';
import { setMoneyDefaults } from '@/lib/format';
import { can as canAbility } from '@/lib/permissions';
import * as authService from '@/services/auth';

const AuthContext = createContext(null);

export const AUTH_QUERY_KEY = ['auth', 'me'];

/**
 * Tear down the signed-in session in the cache.
 *
 * Deliberately NOT queryClient.clear(): that removes the auth query entry
 * itself, and the mounted observer then never learns the session ended — it
 * keeps reporting the previous user, so the app stays on a protected page and
 * a redirect to /login bounces straight back.
 *
 * So: drop every other user's-data query (without which the next person to sign
 * in on a shared machine would briefly see the previous user's figures), and
 * set the auth query's data to null so every consumer re-renders as signed out.
 */
function endSession(queryClient) {
  queryClient.removeQueries({
    predicate: (query) => query.queryKey[0] !== AUTH_QUERY_KEY[0],
  });

  queryClient.setQueryData(AUTH_QUERY_KEY, null);
}

export function AuthProvider({ children }) {
  const queryClient = useQueryClient();

  /*
   * Identity comes from asking the server, not from reading storage. The
   * session is an HttpOnly cookie, so the client genuinely cannot know whether
   * it is signed in without a round trip — that is the point of ADR-002.
   *
   * This is a query rather than useEffect + useState: TanStack Query already
   * owns request deduplication, caching and refetching, and manually
   * reimplementing that in an effect is both more code and the pattern React
   * now warns about.
   */
  const {
    data: user,
    isPending,
    isSuccess,
  } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: async () => {
      const response = await authService.fetchMe();

      return response.data;
    },
    // A 401 is a definitive answer, not a transient failure.
    retry: false,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  /*
   * A single global response to an expired session, fired by the API client.
   * Handling 401 in every hook would mean handling it inconsistently.
   */
  useEffect(() => {
    function handleExpiry() {
      endSession(queryClient);
    }

    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpiry);

    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpiry);
  }, [queryClient]);

  const login = useCallback(
    async (credentials) => {
      const response = await authService.login(credentials);

      // The server already returned the user and abilities; seeding the cache
      // avoids an immediate second round trip to /me.
      queryClient.setQueryData(AUTH_QUERY_KEY, response.data);

      return response.data;
    },
    [queryClient],
  );

  // Sign-up signs the new owner in: the response is the user, as for login.
  const register = useCallback(
    async (details) => {
      const response = await authService.register(details);

      queryClient.setQueryData(AUTH_QUERY_KEY, response.data);

      return response.data;
    },
    [queryClient],
  );

  // Replaces the cached user with the one the server returns, so the change
  // (setup finished, for instance) is seen at once without a refetch.
  const replaceUser = useCallback(
    (next) => queryClient.setQueryData(AUTH_QUERY_KEY, next),
    [queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await authService.logout();
    } catch {
      /*
       * Swallowed on purpose. If the request failed the session may still be
       * alive server-side, but the user asked to sign out and the local session
       * must end regardless — rethrowing would leave them sitting on a
       * protected page looking at someone else's data.
       */
    } finally {
      endSession(queryClient);
    }
  }, [queryClient]);

  const isAuthenticated = isSuccess && Boolean(user);

  /*
   * Money defaults from the business, set during render — as the I18nProvider
   * sets the locale — so the first amount on the first screen is already in
   * the business's currency. A different business means a different sign-in,
   * and signing in replaces this user object.
   */
  if (user?.business) {
    setMoneyDefaults({
      currency: user.business.currency,
      decimals: user.business.currency_decimals,
    });
  }

  const value = useMemo(
    () => ({
      user: user ?? null,
      abilities: user?.abilities ?? [],
      isLoading: isPending,
      isAuthenticated,
      can: (ability) => canAbility(user?.abilities, ability),
      login,
      register,
      replaceUser,
      logout,
    }),
    [user, isPending, isAuthenticated, login, register, replaceUser, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }

  return context;
}
