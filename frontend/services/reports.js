import { api } from '@/lib/apiClient';

/** The report a business hands a lender (phase D3). Every call is logged. */
export function financing() {
  return api.get('/reports/financing');
}
