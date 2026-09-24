import { expect, test } from '@playwright/test';

import { authFile } from './support/authState';

/**
 * Creating and editing records from the screen.
 *
 * Customers, expenses and product edits had no form at all: the API accepted
 * them and nothing in the interface could send one. These run as the SECOND
 * business (Al Noor), so the demo business's three years of history — which
 * the analytics specs read — is left exactly as seeded.
 */
test.describe('as the second business', () => {
  test.use({ storageState: authFile('otherOwner') });

  test('adds a customer and opens their page', async ({ page }) => {
    const stamp = Date.now();
    const name = `Dana Al Rashid ${stamp}`;

    await page.goto('/customers');
    await page.getByRole('button', { name: 'New customer' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Name/ }).fill(name);
    await dialog.getByLabel('Email').fill(`dana+${stamp}@alnoor-customers.test`);
    // A local number, stored in international form by the server (ADR-021).
    await dialog.getByLabel('Phone').fill('99001122');
    await dialog.getByLabel('Country').fill('KW');
    await dialog.getByRole('button', { name: 'Create customer' }).click();

    const table = page.getByRole('table', { name: 'Customers' });
    await expect(table.getByText(name)).toBeVisible();

    await table.getByText(name).click();
    await expect(page).toHaveURL(/\/customers\/\d+$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    // Typed as a local number; shown as the server stored it.
    await expect(page.getByText('+96599001122')).toBeVisible();
    await expect(page.getByText('No orders yet')).toBeVisible();
  });

  test('records an expense and sees it in the list', async ({ page }) => {
    const stamp = Date.now();
    const description = `Delivery fuel ${stamp}`;

    await page.goto('/expenses');
    await page.getByRole('button', { name: 'New expense' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Description/ }).fill(description);
    await dialog.getByLabel('Category').selectOption({ index: 1 });
    await dialog.getByLabel('Amount').fill('12.5');
    await dialog.getByRole('button', { name: 'Record expense' }).click();

    const table = page.getByRole('table', { name: 'Expenses' });
    await expect(table.getByText(description)).toBeVisible();
    // The second business trades in KWD, at three decimal places.
    await expect(table).toContainText('KWD 12.500');
  });

  test('edits a product, and cannot edit its SKU', async ({ page }) => {
    await page.goto('/products?search=NOOR-004');

    const table = page.getByRole('table', { name: 'Products' });
    await table.getByText('Rose water 250ml').click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: 'Edit product' })).toBeVisible();
    // Order lines snapshot the SKU, so it is fixed once the product exists.
    await expect(dialog.getByRole('textbox', { name: /^SKU/ })).toHaveAttribute('readonly', '');

    await dialog.getByLabel('Price').fill('1.850');
    await dialog.getByRole('button', { name: 'Save' }).click();

    await expect(table).toContainText('KWD 1.850');
  });
});

test.describe('as the first business', () => {
  test.use({ storageState: authFile('owner') });

  test('follows an order through to the customer who placed it', async ({ page }) => {
    await page.goto('/orders?payment_status=settled');

    const orders = page.getByRole('table', { name: 'Orders' });
    await expect(orders).toBeVisible();
    await orders.getByRole('link', { name: /^ORD-/ }).first().click();

    // The order screen has always linked to the customer; until now the link
    // led to a page that did not exist.
    const customerLink = page.getByRole('link', { name: /.+/ }).filter({ hasText: /\w/ });
    await expect(customerLink.first()).toBeVisible();

    const link = page.locator('a[href^="/customers/"]').first();
    const name = (await link.innerText()).trim();
    await link.click();

    await expect(page).toHaveURL(/\/customers\/\d+$/);
    await expect(page.getByRole('heading', { name })).toBeVisible();
    await expect(page.getByRole('table', { name: /Orders placed by/ })).toBeVisible();
  });
});
