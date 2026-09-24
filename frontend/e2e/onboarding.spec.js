import { expect, test } from '@playwright/test';

/**
 * A business signs itself up and starts trading, through a real browser
 * (ADR-024).
 *
 * This is the whole path a stranger takes: the sign-in screen, sign-up, the
 * four setup questions, an empty dashboard, a first product, a first order —
 * and the figure that order produces, in the currency the wizard chose rather
 * than the one the demo business happens to use.
 *
 * It signs in for itself (no saved session), so it runs in the anonymous
 * project. Each run leaves a real business behind in the development database,
 * which is the point: the flow is exercised against the real API, not a mock.
 */
test.describe('a new business', () => {
  test('signs up, sets itself up, and records its first sale', async ({ page }) => {
    const stamp = Date.now();
    const email = `owner+${stamp}@e2e.test`;
    const businessName = `E2E Trading ${stamp}`;

    // ---- Sign-up ----------------------------------------------------------
    await page.goto('/login');
    await page.getByRole('link', { name: 'Set up your business' }).click();
    await expect(page).toHaveURL(/\/register/);

    await page.getByLabel('Business name').fill(businessName);
    await page.getByLabel('Your name').fill('Maryam Al Khalifa');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill('a-long-enough-passphrase');
    await page.getByRole('button', { name: 'Create business' }).click();

    // ---- The setup wizard --------------------------------------------------
    // Sign-up is deliberately slow: the password is hashed, and the policy
    // checks it against a breach corpus over the network (SECURITY.md §3).
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 30_000 });
    await expect(
      page.getByRole('heading', { name: 'Where does your business trade?' }),
    ).toBeVisible();

    await page.getByLabel('Country').selectOption('KW');
    // The country's consequences are shown before they are saved.
    await expect(page.getByText('KWD — 3 decimal places')).toBeVisible();
    await page.getByRole('button', { name: 'Next' }).click();

    // Kuwait charges no VAT, so the box starts unticked.
    await expect(
      page.getByRole('heading', { name: 'Does your business charge VAT?' }),
    ).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Charge VAT on sales' })).not.toBeChecked();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: 'Which days are your weekend?' })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'Friday' })).toBeChecked();
    await expect(page.getByRole('checkbox', { name: 'Saturday' })).toBeChecked();
    await page.getByRole('button', { name: 'Next' }).click();

    await expect(page.getByRole('heading', { name: 'Your business is set up' })).toBeVisible();
    await page.getByRole('button', { name: 'Add the first product' }).click();

    // ---- An empty catalogue, and the first product -------------------------
    await expect(page).toHaveURL(/\/products/);
    await expect(page.getByText('No products yet')).toBeVisible();

    await page.getByRole('button', { name: 'New product' }).first().click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('SKU').fill('E2E-1');
    // A required field's label carries a marker, so match its start, not all of it.
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Saffron tin');
    await dialog.getByLabel('Price').fill('12.5');
    await dialog.getByLabel('Cost').fill('5');
    await dialog.getByLabel('Opening stock').fill('10');
    await dialog.getByRole('button', { name: 'Create product' }).click();

    // Priced in the currency the wizard chose, at its three decimal places.
    const products = page.getByRole('table', { name: 'Products' });
    await expect(products.getByText('Saffron tin')).toBeVisible();
    await expect(products).toContainText('KWD 12.500');

    // ---- The first order ---------------------------------------------------
    await page.goto('/orders/new');
    await page.getByRole('button', { name: 'Start draft' }).click();

    // The only product in a brand-new catalogue: the first real option.
    await page.getByLabel('Product').selectOption({ index: 1 });
    await page.getByLabel('Quantity').fill('2');
    await page.getByRole('button', { name: 'Add item' }).click();
    await page.getByRole('button', { name: 'Save and view draft' }).click();

    await expect(page).toHaveURL(/\/orders\/\d+$/);
    await page.getByRole('button', { name: 'Confirm order' }).click();

    // 2 × 12.500 = 25.000, in KWD, with no VAT for Kuwait.
    await expect(page.getByText('KWD 25.000').first()).toBeVisible();

    // ---- And the dashboard now has something to say ------------------------
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: businessName })).toHaveCount(0);
    await expect(page.getByText('KWD', { exact: false }).first()).toBeVisible();
  });
});
