'use client';

import { useQuery } from '@tanstack/react-query';

import { queryKeys } from '@/lib/queryKeys';
import * as analytics from '@/services/analytics';

/**
 * The insights feed.
 *
 * Returns `suppressed` alongside the findings, and the screen is expected to
 * use it. An empty feed has two entirely different meanings — "nothing is
 * wrong" and "the rules were not allowed to run" — and rendering both as blank
 * space tells the reader the first when the truth is the second.
 */
export function useInsights(period) {
  const query = useQuery({
    queryKey: queryKeys.insights.list(period),
    queryFn: () => analytics.getInsights(period),
    placeholderData: (previous) => previous,
  });

  return {
    insights: query.data?.data ?? [],
    suppressed: query.data?.meta?.suppressed ?? null,
    meta: query.data?.meta,
    ...query,
  };
}
