/**
 * Analytics. This module owns its endpoint paths; nothing else knows them.
 *
 * Every call carries the period, so the query key encodes it and changing the
 * period is a cache miss rather than a stale render under a new range.
 */

import { api } from '@/lib/apiClient';

export function getDashboard(params) {
  return api.get('/dashboard', { params });
}

export function getSummary(params) {
  return api.get('/analytics/summary', { params });
}

export function getTimeseries(params) {
  return api.get('/analytics/timeseries', { params });
}

export function getBreakdown(params) {
  return api.get('/analytics/breakdown', { params });
}

/**
 * The insights feed (L3).
 *
 * Lives beside the analytics calls because it reads the same layer and takes
 * the same period parameters — an insight and the screen it links to must
 * describe the same window or the link is a lie.
 */
export function getInsights(params) {
  return api.get('/insights', { params });
}
