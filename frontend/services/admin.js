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

/** The log at a glance: today, this week, who was at work, failed sign-ins. */
export function activitySummary() {
  return api.get('/activity/summary');
}

export function exportActivity(params) {
  return download('/activity/export', { params, fallbackName: 'activity-log.csv' });
}

/* -------------------------------------------------------------------------- */
/* Users                                                                       */
/* -------------------------------------------------------------------------- */

/** Each role, what the server lets it do, and who holds it. */
export function listRoles() {
  return api.get('/roles');
}

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

/* -------------------------------------------------------------------------- */
/* Integrations                                                                */
/* -------------------------------------------------------------------------- */

export function listIntegrations() {
  return api.get('/integrations');
}

/**
 * Claiming a store that has installed the app.
 *
 * The server answers 404 for all three refusals — no such store, expired,
 * already connected — on purpose, so this passes the error through rather
 * than translating it into a guess about which one happened.
 */
export function claimStore(body) {
  return api.post('/integrations/claim', body);
}

/**
 * Zid connects through its own consent screen (ADR-037). The first call
 * returns where to send the browser; Zid sends it back to the callback page,
 * which hands the code and state to the second, inside this session.
 */
export function zidAuthorizeUrl() {
  return api.get('/integrations/zid/authorize');
}

export function completeZid(body) {
  return api.post('/integrations/zid/callback', body);
}

/**
 * Importing from a file (ADR-039). Both calls carry the file: the server
 * keeps nothing between them, so there is no stored spreadsheet of
 * customers' numbers to clean up.
 */
function importForm(file, kind, mapping, dryRun) {
  const form = new FormData();
  form.append('file', file);
  form.append('kind', kind);

  if (mapping) {
    // An empty value for an unmapped field, so the array is never empty and
    // the server reads "not in this file" rather than "no mapping sent".
    Object.entries(mapping).forEach(([field, index]) => {
      form.append(`mapping[${field}]`, index === null || index === undefined ? '' : String(index));
    });
    form.append('dry_run', dryRun ? '1' : '0');
  }

  return form;
}

export function previewImport({ file, kind }) {
  return api.post('/imports/preview', importForm(file, kind));
}

export function runImport({ file, kind, mapping, dryRun }) {
  return api.post('/imports', importForm(file, kind, mapping, dryRun));
}

export function disconnectIntegration(id) {
  return api.delete(`/integrations/${id}`);
}

/* -------------------------------------------------------------------------- */
/* The universal connection: keys any system sends orders in with              */
/* -------------------------------------------------------------------------- */

export function listApiKeys() {
  return api.get('/integrations/api-keys');
}

/** Answers with the key in full, once; it can never be read back. */
export function createApiKey(body) {
  return api.post('/integrations/api-keys', body);
}

export function revokeApiKey(id) {
  return api.delete(`/integrations/api-keys/${id}`);
}
