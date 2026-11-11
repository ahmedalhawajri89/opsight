import { api } from '@/lib/apiClient';

/** Forecasts (product track, phase D). */
export function stock({ lead_time, cover_days }) {
  return api.get('/forecasts/stock', { params: { lead_time, cover_days } });
}
