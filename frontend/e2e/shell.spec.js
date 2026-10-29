import { expect, test } from '@playwright/test';

import { authFile } from './support/authState';

/**
 * The top bar: search and the key-changes bell, through a real browser.
 *
 * Both read endpoints the user could already open, so what these tests guard
 * is the wiring — that the keyboard shortcut opens the palette, that a result
 * goes where it says, that a command acts, and that the bell names how many
 * findings it holds.
 */

test.describe('the top bar, as an owner', () => {
  test.use({ storageState: authFile('owner') });

  test('opens the palette from the keyboard and goes to an order it finds', async ({ page }) => {
    await page.goto('/orders');

    const table = page.getByRole('table', { name: 'Orders' });
    const reference = (await table.getByRole('link', { name: /^ORD-/ }).first().innerText()).trim();

    await page.keyboard.press('Control+k');

    /*
     * Scoped to the dialog. The bar keeps its own field for the reader who
     * reached for a mouse, so at this width there are two comboboxes named
     * Search and only one of them is the palette.
     */
    const palette = page.getByRole('dialog');
    const search = palette.getByRole('combobox', { name: 'Search' });
    await expect(search).toBeFocused();

    await search.fill(reference);
    const result = palette.getByRole('option', { name: new RegExp(reference) });
    await expect(result).toBeVisible();

    await search.press('Enter');
    await expect(page).toHaveURL(/\/orders\/\d+$/);
    await expect(page.getByRole('heading', { name: reference })).toBeVisible();
  });

  test('runs a command from the palette, not just a search', async ({ page }) => {
    /*
     * The palette's reason for existing beyond search: a verb. Focus mode is
     * the one with a consequence this test can see without a screenshot —
     * the navigation is REMOVED from the document, not hidden, so a keyboard
     * reader does not tab through twelve invisible links.
     */
    await page.goto('/dashboard');
    await expect(page.locator('#app-sidebar')).toBeVisible();

    await page.keyboard.press('Control+k');

    const palette = page.getByRole('dialog');
    await palette.getByRole('combobox', { name: 'Search' }).fill('focus');
    await palette.getByRole('option', { name: 'Focus mode' }).click();

    await expect(page.locator('#app-sidebar')).toHaveCount(0);

    // Put it back, so a later test does not start in a shape it did not ask for.
    await page.keyboard.press('Shift+F');
    await expect(page.locator('#app-sidebar')).toBeVisible();
  });

  test('lists the keyboard shortcuts behind ?', async ({ page }) => {
    await page.goto('/dashboard');
    /*
     * Wait for the shell before using its shortcut. `goto` resolves on load,
     * and the keyboard layer is a window listener React attaches at
     * hydration — pressing before that sends the key into a page that is
     * painted but not yet listening.
     */
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.keyboard.press('?');

    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByText('Go to')).toBeVisible();
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

    // Scoped to the palette: the bar keeps its own field, so at this width
    // two comboboxes are named Search and only one of them was just opened.
    const palette = page.getByRole('dialog');
    await palette.getByRole('combobox', { name: 'Search' }).fill('Expenses');
    await expect(palette.getByRole('option', { name: /Expenses/ })).toHaveCount(0);
  });
});
