import fs from 'node:fs';
import path from 'node:path';

import { STATE_DIR } from './authState';

/**
 * The interface language, which the suite needs to hold still.
 *
 * Language is a preference stored on the ACCOUNT, not on the browser, and
 * every spec here asserts English strings. The owner of this installation
 * works in Arabic, so whenever the dashboard had last been looked at in
 * Arabic the next full run failed in bulk — thirty-seven specs in one run —
 * with snapshots showing "لوحة المعلومات" where the spec waited for
 * "Dashboard". Nothing was wrong with the application. The suite was reading
 * a preference it had never set.
 *
 * So setup pins each account to English and records what it found, and the
 * teardown project puts every one of them back. A test suite may borrow a
 * person's settings; it may not keep them.
 */
const API = process.env.E2E_API_URL ?? 'http://localhost:8010';

/** Where setup leaves what it found, for the teardown to restore. */
export const ORIGINALS_FILE = path.join(STATE_DIR, 'preferences.json');

export const ENGLISH = { locale: 'en', numerals: 'latn' };

/**
 * Reads the signed-in account's own preferences.
 *
 * Through the page rather than the database: the session cookie is HttpOnly
 * and the API is the only thing that can read it, which also means this works
 * unchanged against an API that is not on this machine.
 */
export async function readPreferences(page) {
  return page.evaluate(async (api) => {
    const response = await fetch(`${api}/api/v1/me`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });

    const body = await response.json();
    const user = body.data ?? body;

    return { locale: user.locale, numerals: user.numerals };
  }, API);
}

/** Saves preferences with the page's own session and CSRF token. */
export async function savePreferences(page, preferences) {
  return page.evaluate(
    async ({ api, body }) => {
      const token = decodeURIComponent(
        document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
          ?.split('=')[1] ?? '',
      );

      const response = await fetch(`${api}/api/v1/me/preferences`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': token,
        },
        body: JSON.stringify(body),
      });

      return response.status;
    },
    { api: API, body: preferences },
  );
}

/** Notes what a role's preferences were before the suite changed them. */
export function rememberOriginal(role, preferences) {
  const originals = readOriginals();

  originals[role] = preferences;

  fs.mkdirSync(STATE_DIR, { recursive: true });
  fs.writeFileSync(ORIGINALS_FILE, JSON.stringify(originals, null, 2));
}

/** What the last setup found, or nothing if it never ran. */
export function readOriginals() {
  try {
    return JSON.parse(fs.readFileSync(ORIGINALS_FILE, 'utf8'));
  } catch {
    // Absent on a first run, and unreadable is the same thing: there is
    // nothing to put back.
    return {};
  }
}
