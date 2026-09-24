/**
 * The auth resource. This module owns its endpoint paths; nothing else knows them.
 */

import { api, request } from '@/lib/apiClient';

export function login({ email, password, remember = false }) {
  return api.post('/auth/login', { email, password, remember });
}

/** A new business and its owner; the owner comes back signed in (ADR-024). */
export function register({ businessName, name, email, password, locale }) {
  return api.post('/auth/register', {
    business_name: businessName,
    name,
    email,
    password,
    locale,
  });
}

/** The end of the setup wizard: where the business trades, and that setup is done. */
export function completeOnboarding({ country }) {
  return api.post('/onboarding/complete', { country });
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
