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

    // The dialog closes only once the server has accepted it — and navigating
    // before that aborts the request in flight.
    await expect(dialog).toBeHidden();

    /*
     * Search for it rather than expecting it on the page already shown.
     *
     * This test adds a customer every time it runs, and the list is sorted by
     * name and paginated at 25 — so once the business passed a page of
     * customers the newest one fell off the end and the test could never pass
     * again. A test that poisons its own fixture is worse than no test: it
     * passes for months and then fails deterministically for a reason that
     * looks like flake.
     */
    await page.goto(`/customers?search=${stamp}`);

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

  test('shows the whole server message when a field is refused', async ({ page }) => {
    await page.goto('/products');
    await page.getByRole('button', { name: 'New product' }).first().click();

    const dialog = page.getByRole('dialog');
    // NOOR-001 is already in this business's catalogue.
    await dialog.getByRole('textbox', { name: /^SKU/ }).fill('NOOR-001');
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Duplicate');
    await dialog.getByLabel('Price').fill('1');
    await dialog.getByLabel('Cost').fill('1');
    await dialog.getByRole('button', { name: 'Create product' }).click();

    // A whole sentence. Each of these rendered as its single first letter
    // while the form indexed a string as if it were an array of messages.
    await expect(dialog.getByText('This SKU is already in use.')).toBeVisible();
  });

  test('deletes an expense it just recorded', async ({ page }) => {
    const description = `Scrap run ${Date.now()}`;

    await page.goto('/expenses');
    await page.getByRole('button', { name: 'New expense' }).first().click();

    let dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Description/ }).fill(description);
    await dialog.getByLabel('Category').selectOption({ index: 1 });
    await dialog.getByLabel('Amount').fill('3');
    await dialog.getByRole('button', { name: 'Record expense' }).click();

    const table = page.getByRole('table', { name: 'Expenses' });
    await expect(table.getByText(description)).toBeVisible();

    await table.getByText(description).click();
    dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Delete expense' }).click();

    // The confirmation says what it costs the figures, then removes the row.
    const confirmation = dialog.getByRole('alertdialog', { name: 'Delete this expense?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Delete expense' }).click();

    await expect(table.getByText(description)).toHaveCount(0);
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

  test('searches the list from the order form instead of scrolling a page of it', async ({
    page,
  }) => {
    /*
     * The form used to load the first hundred customers and the first hundred
     * products and offer no way to reach the rest — a hundred being the
     * server's own maximum page, not a soft limit it could raise. Both lists
     * are searchable now, on the server.
     *
     * Only the customer list is exercised here, because it is on the screen
     * before a draft exists: the product list sits behind "Start draft", and a
     * test that creates an order would change this business's order count,
     * which the isolation spec asserts exactly. Both lists are the same
     * component (CatalogPicker, covered per-state in tests/components.test.jsx)
     * bound to a different hook.
     */
    await page.goto('/orders/new');

    const customer = page.getByLabel('Customer', { exact: true });
    const search = page.getByLabel('Search customers');

    /*
     * Polled, not counted once: `locator.count()` does not auto-wait, so
     * reading it straight after goto() asks how many options exist before the
     * list has been fetched — which is zero, every time.
     *
     * A lower bound rather than an exact count, because the customer form test
     * above adds one customer to this business on every run.
     */
    await expect
      .poll(() => customer.locator('option').count())
      .toBeGreaterThan(2);

    await search.fill('Mishref');
    await expect(customer.locator('option')).toHaveCount(2);
    await customer.selectOption({ index: 1 });
    await expect(customer).toHaveValue(/\d+/);

    // A term that matches nothing says so, rather than showing a bare list —
    // and the customer already chosen stays chosen, and stays visible.
    await search.fill('Zzzz No Such Customer');
    await expect(page.getByText(/Zzzz No Such Customer/)).toBeVisible();
    await expect(customer.locator('option')).toHaveCount(2);
    await expect(customer).toHaveValue(/\d+/);
  });
});

test.describe('an account holder', () => {
  test.use({ storageState: authFile('owner') });

  test('creates an account, then that person changes their own password', async ({
    page,
    browser,
  }) => {
    const stamp = Date.now();
    const email = `e2e.staff+${stamp}@opsight.test`;
    const first = 'first-long-passphrase';
    const second = 'second-long-passphrase';

    // ---- An owner creates the account --------------------------------------
    await page.goto('/settings/users');
    await page.getByRole('button', { name: 'Add user' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Name/ }).fill(`E2E Staff ${stamp}`);
    await dialog.getByLabel('Email').fill(email);
    await dialog.getByRole('textbox', { name: 'Password', exact: true }).fill(first);
    await dialog.getByRole('textbox', { name: 'Confirm password' }).fill(first);
    await dialog.getByRole('button', { name: 'Create user' }).click();

    await expect(page.getByRole('table', { name: 'Users' })).toContainText(email);

    // ---- That person signs in and changes their own password ---------------
    // The owner's session is dropped rather than a second context opened: a
    // context made from the browser fixture carries none of the test's own
    // options, and this test is about one account at a time anyway.
    await page.context().clearCookies();

    async function signIn(password) {
      await page.goto('/login');
      await page.getByLabel('Email').fill(email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByRole('button', { name: 'Sign in' }).click();
    }

    await signIn(first);
    await expect(page).toHaveURL(/\/dashboard/);

    await page.goto('/profile');
    await page.getByLabel('Current password').fill(first);
    await page.getByLabel('New password').fill(second);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByText('Password changed. This device stays signed in.')).toBeVisible();

    // Still signed in: securing an account must not throw you out of it.
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    await page.getByRole('button', { name: /^Account/ }).click();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);

    // The old password no longer opens the account; the new one does.
    await signIn(first);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    await signIn(second);
    await expect(page).toHaveURL(/\/dashboard/);

    // The account is left in place: accounts are deactivated by an owner, not
    // deleted, and every run makes its own.
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
