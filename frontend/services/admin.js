/**
 * Administration: the activity log, users and business settings.
 *
 * Grouped because they share an audience — an Owner on the settings screens —
 * rather than because they share a shape. Splitting three small modules apart
 * would be structure without substance.
 */

import { api, download } from '@/lib/apiClient';

/* -------------------------------------------------------------------------- */
/* Activity log                                                                */
/* -------------------------------------------------------------------------- */

/**
 * Cursor-paged, not page-numbered. The API offers no total and no page count
 * for this table, so the UI offers "next" and "previous" and nothing else —
 * see FRONTEND_ARCHITECTURE.md and the controller's own note on why.
 */
export function listActivity(params) {
  return api.get('/activity', { params });
}

export function listActivityActions() {
  return api.get('/activity/actions');
}

export function exportActivity(params) {
  return download('/activity/export', { params, fallbackName: 'activity-log.csv' });
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

export function listUsers(params) {
  return api.get('/users', { params });
}

export function createUser(body) {
  return api.post('/users', body);
}

export function updateUser(id, body) {
  return api.patch(`/users/${id}`, body);
}

/*
 * Role and activation are separate calls, not fields on the update above.
 * Each runs the last-Owner guard server-side and each is a distinct entry in
 * the audit log, so folding them into a generic patch would hide a privilege
 * change inside a name edit.
 */
export function changeUserRole(id, role) {
  return api.post(`/users/${id}/role`, { role });
}

export function setUserActive(id, active) {
  return api.post(`/users/${id}/${active ? 'activate' : 'deactivate'}`);
}

/* -------------------------------------------------------------------------- */
/* Business settings                                                           */
/* -------------------------------------------------------------------------- */

export function getSettings() {
  return api.get('/settings');
}

export function updateSettings(body) {
  return api.patch('/settings', body);
}

export function listExpenseCategories() {
  return api.get('/settings/expense-categories');
}
