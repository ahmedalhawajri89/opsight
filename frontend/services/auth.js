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

/**
 * The signed-in user's own language and digits. Returns the updated user, so
 * the auth cache can be replaced rather than refetched.
 */
export function updatePreferences({ locale, numerals }) {
  return api.patch('/me/preferences', { locale, numerals });
}
