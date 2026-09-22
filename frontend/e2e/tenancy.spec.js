import { expect, test } from '@playwright/test';

import { authFile } from './support/authState';

/**
 * Two businesses on one installation, through a real browser (ADR-023).
 *
 * The seed puts a second business beside the first: Al Noor Trading, in KWD,
 * with its own owner, catalogue and customers — and order numbers that start
 * from ORD-…-000001 exactly as the first business's do. Each owner signs in
 * and must see only their own; the one who holds a link to the other's order
 * gets "not found", not the order and not a hint that it exists.
 */

const THEIR_CUSTOMER = 'Khalid Al Mutairi';

test.describe('the second business, as its own owner', () => {
  test.use({ storageState: authFile('otherOwner') });

  test('sees its own orders, in its own currency', async ({ page }) => {
    await page.goto('/orders');

    const table = page.getByRole('table', { name: 'Orders' });
    await expect(table.getByRole('link', { name: /^ORD-\d{4}-\d{6}$/ }).first()).toBeVisible();

    // Exactly its own twelve orders, not the first business's thousands.
    await expect(page.getByRole('status')).toContainText(/of 12\b/);
    await expect(table).toContainText('KWD');
    await expect(table).toContainText(THEIR_CUSTOMER);
  });
});

test.describe('the first business, as its owner', () => {
  test.use({ storageState: authFile('owner') });

  test("cannot find the other business's customer", async ({ page }) => {
    await page.goto(`/customers?search=${encodeURIComponent(THEIR_CUSTOMER)}`);

    // The empty state repeats the search term back; the rows are what count.
    await expect(page.getByText('No matching records')).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(THEIR_CUSTOMER) })).toHaveCount(0);
  });

  test('gets "not found" for a link to the other business\'s order', async ({ page, browser }) => {
    // Find one of their orders the way a leaked link would carry it: its id.
    const theirs = await browser.newContext({ storageState: authFile('otherOwner') });
    const theirPage = await theirs.newPage();
    await theirPage.goto('/orders');
    const link = theirPage
      .getByRole('table', { name: 'Orders' })
      .getByRole('link', { name: /^ORD-/ })
      .first();
    await expect(link).toBeVisible();
    const href = await link.getAttribute('href');
    const reference = (await link.innerText()).trim();
    await theirs.close();

    await page.goto(href);

    await expect(page.getByText('Resource not found.')).toBeVisible();
    await expect(page.getByRole('heading', { name: reference })).toHaveCount(0);
  });
});
