import { api } from '@/lib/apiClient';

/** Forecasts (product track, phase D). */
export function stock({ lead_time, cover_days }) {
  return api.get('/forecasts/stock', { params: { lead_time, cover_days } });
}

/** Thirteen weeks of cash, in and out, with every assumption (phase D2). */
export function cash() {
  return api.get('/forecasts/cash');
}

/** The one figure the forecast cannot know: what is in the bank, and when. */
export function setCashBalance({ amount, as_of }) {
  return api.put('/forecasts/cash/balance', { amount, as_of });
}

/** The least cash the owner wants to keep; the forecast marks weeks below it. */
export function setCashThreshold({ amount }) {
  return api.put('/forecasts/cash/threshold', { amount });
}
