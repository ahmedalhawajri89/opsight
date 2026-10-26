import { expect, test as setup } from '@playwright/test';

import { ACCOUNTS, authFile } from './support/authState';
import { ENGLISH, readPreferences, rememberOriginal, savePreferences } from './support/preferences';

/**
 * Sign in once per role and save the session for the rest of the suite.
 *
 * WHY THIS EXISTS. Every spec used to sign in for itself, which meant twenty-odd
 * logins inside two minutes — and the API rate-limits `/auth/login` to ten per
 * minute per IP. The later specs got a 429 and failed in a way that vanished
 * when they were run alone.
 *
 * The limit is correct and stays. Logging in twenty times to test twenty things
 * that are not login was the actual mistake: it is slower, it is redundant, and
 * it made the suite fight a production safeguard. Signing in once per role and
 * reusing the cookie is both the fix and the better pattern.
 *
 * auth.spec.js deliberately does NOT use these states — it is the spec that
 * tests signing in and out, so it must do it for real.
 *
 * It also pins each account's language to English, because every spec in the
 * suite asserts English strings and the language is a preference stored on
 * the account rather than in the browser. Left to inherit whatever the last
 * human chose, the suite failed thirty-seven specs in one run against an
 * application that was working perfectly — it was reading Arabic because the
 * owner reads Arabic. What was there is written down and put back by the
 * teardown project (support/preferences.js).
 */

for (const [role, email] of ACCOUNTS) {
  setup(`authenticate as ${role}`, async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('password');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard/);

    // Persist the HttpOnly session cookie for the dependent projects.
    await page.context().storageState({ path: authFile(role) });

    const original = await readPreferences(page);

    // Recorded before anything is changed, and recorded even when it is
    // already English: a teardown that only knows about the accounts it had
    // to change cannot tell "unchanged" from "never seen".
    rememberOriginal(role, original);

    if (original.locale !== ENGLISH.locale || original.numerals !== ENGLISH.numerals) {
      expect(await savePreferences(page, ENGLISH)).toBe(200);
    }
  });
}
