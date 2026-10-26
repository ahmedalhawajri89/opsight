import { expect, test as teardown } from '@playwright/test';

import { ACCOUNTS, authFile } from './support/authState';
import { ENGLISH, readOriginals, savePreferences } from './support/preferences';

/**
 * Gives each account its language back.
 *
 * The setup project pins every account to English so the specs can assert
 * English, and writes down what it found first. This puts that back. The
 * owner of this installation reads Arabic; a suite that leaves their own
 * application in a language they did not choose has not finished running.
 *
 * It runs as the setup project's `teardown`, which means after every project
 * that depends on setup — all of them, which is why the anonymous project
 * declares the dependency too even though it signs in for itself. Restoring
 * Arabic halfway through would break the specs still asserting English.
 */
teardown('restore each account\'s language', async ({ browser }) => {
  const originals = readOriginals();

  for (const [role] of ACCOUNTS) {
    const original = originals[role];

    if (original === undefined) continue;

    if (original.locale === ENGLISH.locale && original.numerals === ENGLISH.numerals) {
      continue;
    }

    /*
     * A context per account, from the session the setup saved: the preference
     * belongs to whoever is signed in, so it can only be written back by them.
     */
    const context = await browser.newContext({ storageState: authFile(role) });
    const page = await context.newPage();

    try {
      // Any page of the application will do; the call needs its origin and
      // its CSRF cookie, not anything on the screen.
      await page.goto('/dashboard');
      expect(await savePreferences(page, original)).toBe(200);
    } finally {
      await context.close();
    }
  }
});
