/**
 * The auth resource. This module owns its endpoint paths; nothing else knows them.
 */

import { api, request } from '@/lib/apiClient';

export function login({ email, password }) {
  return api.post('/auth/login', { email, password });
}

export function logout() {
  return api.post('/auth/logout');
}

/**
 * The session probe.
 *
 * A 401 here means "not signed in" — an answer, not an expiry event — so the
 * global session-expired signal is suppressed for this call.
 */
export function fetchMe() {
  return request('/me', { suppressExpiryEvent: true });
}
