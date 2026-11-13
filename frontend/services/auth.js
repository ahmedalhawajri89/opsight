/**
 * The auth resource. This module owns its endpoint paths; nothing else knows them.
 */

import { api, request } from '@/lib/apiClient';

export function login({ email, password, remember = false }) {
  return api.post('/auth/login', { email, password, remember });
}

/**
 * Signing in with a Google ID token (Google Identity Services). Signs in an
 * account that already exists; the server never creates one from Google.
 */
export function loginWithGoogle({ credential }) {
  return api.post('/auth/google', { credential });
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

/**
 * Asks for a link to choose a new password. The server answers 202 with the
 * same sentence whether or not the address has an account.
 */
export function forgotPassword({ email }) {
  return api.post('/auth/forgot-password', { email });
}

/** A new password from an emailed link. Not signed in afterwards. */
export function resetPassword({ token, email, password }) {
  return api.post('/auth/reset-password', { token, email, password });
}

/**
 * The link in the confirmation email, posted back as it arrived: the account,
 * the expiry and the signature. Public — the link may be opened anywhere.
 */
export function verifyEmail({ id, expires, signature }) {
  return api.post('/auth/email/verify', { id, expires, signature });
}

/** Another confirmation email to the signed-in account's address. */
export function resendVerification() {
  return api.post('/me/email/verification');
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
 * A user's own password. The server requires the current one, and answers 204:
 * nothing about a password comes back.
 */
export function changePassword({ current_password: currentPassword, password }) {
  return api.patch('/me/password', { current_password: currentPassword, password });
}

/**
 * The signed-in user's own language and digits. Returns the updated user, so
 * the auth cache can be replaced rather than refetched.
 */
export function updatePreferences({ locale, numerals }) {
  return api.patch('/me/preferences', { locale, numerals });
}
