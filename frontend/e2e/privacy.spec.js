import { expect, test } from '@playwright/test';

/**
 * The privacy statement, read by someone with no account (ADR-026).
 *
 * The whole point of the page is that it is reachable without signing in, and
 * the way that could silently break is a route group change putting it behind
 * the (app) layout's authentication gate. This spec runs in the `anonymous`
 * project, with no stored session.
 */
test.describe('a visitor with no account', () => {
  test('reads the privacy statement without signing in', async ({ page }) => {
    await page.goto('/privacy');

    // Not bounced to /login, which is what the gate would do.
    await expect(page).toHaveURL(/\/privacy$/);
    await expect(page.getByRole('heading', { name: 'Privacy', exact: true })).toBeVisible();

    // The two claims a reader is most likely to come for.
    await expect(page.getByRole('heading', { name: 'How long it is kept' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Asking to be forgotten' })).toBeVisible();

    await page.getByRole('link', { name: 'Back to sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('is reachable from the sign-in screen, and reads in Arabic', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Privacy' }).click();

    await expect(page).toHaveURL(/\/privacy$/);

    await page.getByRole('button', { name: 'العربية' }).click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { name: 'الخصوصية', exact: true })).toBeVisible();
  });
});
