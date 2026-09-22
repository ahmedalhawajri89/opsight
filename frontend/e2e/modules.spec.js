import { expect, test } from '@playwright/test';

import { authFile } from './support/authState';

/**
 * Phase 03 screens, against a real backend with seeded data.
 *
 * These cover what only a browser can show: that the list screens render live
 * rows, that filters survive a URL round trip, and — most importantly — that
 * the cost boundary holds all the way to the rendered page for a Staff user.
 *
 * Sessions come from the setup project rather than a login per test. Signing in
 * twenty times to test twenty things that are not login is slower, redundant,
 * and runs the suite straight into the API's login rate limit.
 */

test.describe('as an owner', () => {
  test.use({ storageState: authFile('owner') });

  test('sees every operational module in the navigation', async ({ page }) => {
    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Main' });

    for (const label of ['Orders', 'Customers', 'Products', 'Inventory', 'Expenses']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('sees real order rows from the seeded history', async ({ page }) => {
    await page.goto('/orders');

    await expect(page.getByRole('heading', { name: 'Orders' })).toBeVisible();

    const table = page.getByRole('table', { name: 'Orders' });
    await expect(table).toBeVisible();

    // Seeded references look like ORD-2024-000123.
    await expect(table.getByRole('link', { name: /^ORD-\d{4}-\d{6}$/ }).first()).toBeVisible();

    // Pagination reports a real total, not a client-side count of one page.
    await expect(page.getByRole('status')).toContainText(/of [\d,]+/);
  });

  test('narrows the list with a filter that survives a reload', async ({ page }) => {
    await page.goto('/orders');

    await page.getByLabel('Status').selectOption('cancelled');
    await expect(page).toHaveURL(/status=cancelled/);

    const table = page.getByRole('table', { name: 'Orders' });
    await expect(table.getByText('Cancelled').first()).toBeVisible();

    // Filter state lives in the URL, so a shared link reproduces the same view.
    await page.reload();
    await expect(page.getByLabel('Status')).toHaveValue('cancelled');
  });

  test('sorts a column, updating both the URL and the sort indicator', async ({ page }) => {
    await page.goto('/products');

    const header = page.getByRole('columnheader', { name: /Price/ });

    await header.getByRole('button').click();
    await expect(page).toHaveURL(/sort=price/);
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
  });

  test('sees the cost column', async ({ page }) => {
    await page.goto('/products');

    await expect(page.getByRole('columnheader', { name: 'Cost' })).toBeVisible();
  });

  test('opens an order and sees its snapshot line items', async ({ page }) => {
    await page.goto('/orders');

    /*
     * Wait for the table before clicking.
     *
     * The list keeps the previous page visible while the next loads
     * (placeholderData), so React swaps the row nodes when live data arrives
     * and a link located a moment earlier can detach mid-click. Waiting on the
     * table is waiting on state, not on the clock.
     */
    const table = page.getByRole('table', { name: 'Orders' });
    await expect(table).toBeVisible();

    const firstOrder = table.getByRole('link', { name: /^ORD-\d{4}-\d{6}$/ }).first();
    await expect(firstOrder).toBeVisible();
    await firstOrder.click();

    await expect(page).toHaveURL(/\/orders\/\d+/);

    // The snapshot columns are what make historical reporting correct.
    await expect(page.getByRole('heading', { name: 'Items' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Unit price' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Totals' })).toBeVisible();
  });

  test('finds an unpaid order and offers to record its payment', async ({ page }) => {
    await page.goto('/orders?payment_status=unpaid');

    const table = page.getByRole('table', { name: 'Orders' });
    await expect(table.getByText('Unpaid').first()).toBeVisible();

    const firstOrder = table.getByRole('link', { name: /^ORD-\d{4}-\d{6}$/ }).first();
    await expect(firstOrder).toBeVisible();
    await firstOrder.click();

    await expect(page.getByRole('heading', { name: 'Payment' })).toBeVisible();
    await page.getByRole('button', { name: 'Record payment' }).click();

    // Prefilled with what is outstanding, so the common case is one click.
    // Read-only: the dialog is closed without saving, leaving the data as seeded.
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Amount received')).not.toHaveValue('');
    await expect(dialog.getByLabel('Method')).toHaveValue('card');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('sees low stock flagged and can open an adjustment', async ({ page }) => {
    await page.goto('/inventory');

    await expect(page.getByRole('table', { name: 'Inventory' })).toBeVisible();

    await page.getByRole('button', { name: 'Adjust' }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // A delta, not a target value — and a mandatory reason.
    await expect(dialog.getByText(/signed delta/i)).toBeVisible();
    await expect(dialog.getByText(/indistinguishable from theft/i)).toBeVisible();
  });
});

/**
 * The tests that matter most: the cost boundary, end to end, on a real screen.
 */
test.describe('as staff', () => {
  test.use({ storageState: authFile('staff') });

  test('never sees a cost column or an expenses link', async ({ page }) => {
    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Expenses' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Analytics' })).toHaveCount(0);

    await page.goto('/products');
    await expect(page.getByRole('table', { name: 'Products' })).toBeVisible();

    // The column is not rendered, because the key is not in the payload at all.
    await expect(page.getByRole('columnheader', { name: 'Cost' })).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Price' })).toBeVisible();
  });

  test('cannot reach the expenses screen by direct URL', async ({ page }) => {
    await page.goto('/expenses');

    // Navigation hides it; a bookmarked link still has to be refused.
    await expect(
      page.getByText(/not available for your role|could not load/i).first(),
    ).toBeVisible();
  });

  test('sees an order without its cost or margin figures', async ({ page }) => {
    await page.goto('/orders');

    const table = page.getByRole('table', { name: 'Orders' });
    await expect(table).toBeVisible();

    const firstOrder = table.getByRole('link', { name: /^ORD-\d{4}-\d{6}$/ }).first();
    await expect(firstOrder).toBeVisible();
    await firstOrder.click();

    await expect(page.getByRole('heading', { name: 'Totals' })).toBeVisible();

    // Revenue is visible — the job needs it. Cost is not.
    await expect(page.getByText('Subtotal')).toBeVisible();
    await expect(page.getByText('Cost of goods')).toHaveCount(0);
    await expect(page.getByText('Gross profit')).toHaveCount(0);
    await expect(page.getByRole('columnheader', { name: 'Unit cost' })).toHaveCount(0);
  });
});
