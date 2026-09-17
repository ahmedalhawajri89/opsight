'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AUDITED_KEYS, queryKeys } from '@/lib/queryKeys';
import * as admin from '@/services/admin';

/**
 * Activity log, users and business settings.
 *
 * Every mutation here invalidates the activity log alongside its own data,
 * because every mutation is audited server-side. Without it an Owner changes a
 * role, opens the log, and sees a list that does not mention what they just
 * did — which is exactly the moment an audit tool loses their trust.
 */

/* -------------------------------------------------------------------------- */
/* Activity log                                                                */
/* -------------------------------------------------------------------------- */

/**
 * CURSOR paging, so the caller passes an opaque cursor rather than a page
 * number. There is no total and no last page: the API declines to offer them
 * for its highest-growth table, and inventing them here would mean counting
 * the rows anyway.
 */
export function useActivity(filters) {
  const query = useQuery({
    queryKey: queryKeys.activity.list(filters),
    queryFn: () => admin.listActivity(filters),
    placeholderData: (previous) => previous,
  });

  return {
    entries: query.data?.data ?? [],
    nextCursor: query.data?.meta?.next_cursor ?? null,
    prevCursor: query.data?.meta?.prev_cursor ?? null,
    ...query,
  };
}

/**
 * The action vocabulary, derived from the rows that actually exist.
 *
 * `staleTime` is long because the set of distinct actions changes only when a
 * new kind of event occurs for the first time, which is a matter of releases
 * rather than minutes.
 */
export function useActivityActions() {
  const query = useQuery({
    queryKey: queryKeys.activity.actions,
    queryFn: () => admin.listActivityActions(),
    staleTime: 5 * 60 * 1000,
  });

  return { actions: query.data?.data ?? [], ...query };
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

export function useUsers(filters) {
  const query = useQuery({
    queryKey: queryKeys.users.list(filters),
    queryFn: () => admin.listUsers(filters),
    placeholderData: (previous) => previous,
  });

  return { users: query.data?.data ?? [], meta: query.data?.meta, ...query };
}

export function useUserActions() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    AUDITED_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
  };

  return {
    create: useMutation({ mutationFn: (body) => admin.createUser(body), onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, ...body }) => admin.updateUser(id, body),
      onSuccess: invalidate,
    }),
    /*
     * Separate mutations rather than one "save user" call, mirroring the API.
     * Each can fail on its own terms — the last-Owner guard returns a 409 that
     * a name edit can never produce — and a single mutation would have to
     * report a refusal that applied to only part of what it sent.
     */
    changeRole: useMutation({
      mutationFn: ({ id, role }) => admin.changeUserRole(id, role),
      onSuccess: invalidate,
    }),
    setActive: useMutation({
      mutationFn: ({ id, active }) => admin.setUserActive(id, active),
      onSuccess: invalidate,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Business settings                                                           */
/* -------------------------------------------------------------------------- */

export function useSettings() {
  const query = useQuery({
    queryKey: queryKeys.settings.detail,
    queryFn: () => admin.getSettings(),
  });

  return { settings: query.data?.data, meta: query.data?.meta, ...query };
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body) => admin.updateSettings(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings.all });

      /*
       * The timezone and the fiscal year are inputs to every period boundary,
       * so a settings change can move every figure on every screen. Dropping
       * the analytics caches is not caution — a cached "August" computed in
       * the old timezone is a different August.
       */
      queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.insights.all });

      AUDITED_KEYS.forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });
}

export function useExpenseCategories() {
  const query = useQuery({
    queryKey: queryKeys.settings.expenseCategories,
    queryFn: () => admin.listExpenseCategories(),
    // A fixed vocabulary of eight, read-only in the MVP.
    staleTime: 10 * 60 * 1000,
  });

  return { categories: query.data?.data ?? [], ...query };
}
