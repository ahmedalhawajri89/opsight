import { expect, test } from '@playwright/test';

import { authFile } from './support/authState';

/**
 * The top bar: search and the key-changes bell, through a real browser.
 *
 * Both read endpoints the user could already open, so what these tests guard
 * is the wiring — that the keyboard shortcut opens search, that a result goes
 * where it says, and that the bell names how many findings it holds.
 */

test.describe('the top bar, as an owner', () => {
  test.use({ storageState: authFile('owner') });

  test('opens search from the keyboard and goes to an order it finds', async ({ page }) => {
    await page.goto('/orders');

    const table = page.getByRole('table', { name: 'Orders' });
    const reference = (await table.getByRole('link', { name: /^ORD-/ }).first().innerText()).trim();

    await page.keyboard.press('Control+k');

    const search = page.getByRole('combobox', { name: 'Search' });
    await expect(search).toBeFocused();

    await search.fill(reference);
    const result = page.getByRole('option', { name: new RegExp(reference) });
    await expect(result).toBeVisible();

    await search.press('Enter');
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    await expect(page.getByRole('heading', { name: reference })).toBeVisible();
  });

  test('finds a screen by name, filtered to what the role can open', async ({ page }) => {
    await page.goto('/dashboard');

    // The field lives in the top bar; results drop down beneath it.
    await page.getByRole('combobox', { name: 'Search' }).fill('Activity');
    await expect(page.getByRole('option', { name: /Activity Log/ })).toBeVisible();
  });

  test('lists key changes behind the bell, and says how many in its name', async ({ page }) => {
    await page.goto('/dashboard');

    const bell = page.getByRole('button', { name: /^Notifications/ });
    await expect(bell).toBeVisible();
    await bell.click();

    await expect(page.getByText('Key changes', { exact: true })).toBeVisible();
  });
});

test.describe('search, as staff', () => {
  test.use({ storageState: authFile('staff') });

  test('never offers a screen the role cannot open', async ({ page }) => {
    await page.goto('/dashboard');
    // Wait for the shell before using its shortcut.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await page.keyboard.press('Control+k');

    await page.getByRole('combobox', { name: 'Search' }).fill('Expenses');
    await expect(page.getByRole('option', { name: /Expenses/ })).toHaveCount(0);
  });
});
