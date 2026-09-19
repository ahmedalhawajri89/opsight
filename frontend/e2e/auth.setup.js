import { expect, test as setup } from '@playwright/test';

import { ACCOUNTS, authFile } from './support/authState';

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
  });
}
