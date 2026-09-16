'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import * as analytics from '@/services/analytics';

/**
 * Analytics reads.
 *
 * Each returns `{ <payload>, meta, ...query }`. `meta` carries the resolved
 * period, timezone and comparison basis, and the UI displays those rather than
 * restating what it thinks it asked for — the server is the authority on what
 * the figures actually cover.
 */

export function useDashboard(period) {
  const query = useQuery({
    queryKey: [...queryKeys.dashboard.all, period],
    queryFn: () => analytics.getDashboard(period),
    placeholderData: (previous) => previous,
  });

  return { dashboard: query.data?.data, meta: query.data?.meta, ...query };
}

export function useSummary(period) {
  const query = useQuery({
    queryKey: [...queryKeys.analytics.all, 'summary', period],
    queryFn: () => analytics.getSummary(period),
    placeholderData: (previous) => previous,
  });

  return { metrics: query.data?.data, meta: query.data?.meta, ...query };
}

export function useTimeseries(period, metric, grain) {
  const query = useQuery({
    queryKey: [...queryKeys.analytics.all, 'timeseries', metric, grain, period],
    queryFn: () => analytics.getTimeseries({ ...period, metric, grain }),
    placeholderData: (previous) => previous,
  });

  return { series: query.data?.data ?? [], meta: query.data?.meta, ...query };
}

export function useBreakdown(period, dimension, metric, limit = 10) {
  const query = useQuery({
    queryKey: [...queryKeys.analytics.all, 'breakdown', dimension, metric, limit, period],
    queryFn: () => analytics.getBreakdown({ ...period, dimension, metric, limit }),
    placeholderData: (previous) => previous,
  });

  return { rows: query.data?.data ?? [], meta: query.data?.meta, ...query };
}
