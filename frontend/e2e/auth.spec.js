import { expect, test } from '@playwright/test';

/**
 * Phase 01 E2E — the walking skeleton, through a real browser.
 *
 * This is the only test in the project that proves the whole stack agrees:
 * the browser stores the cookie, Laravel accepts it, abilities cross the wire,
 * and the UI gates on them. Nothing below this level can show that.
 */

const OWNER = { email: 'owner@opsight.test', password: 'password' };
const STAFF = { email: 'staff@opsight.test', password: 'password' };

async function signIn(page, { email, password }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/dashboard/);
}

test('an unauthenticated visitor is sent to the login screen', async ({ page }) => {
  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
});

test('an owner signs in, sees the dashboard, and signs out', async ({ page }) => {
  await signIn(page, OWNER);

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await expect(page.getByText(OWNER.email)).toBeVisible();

  await page.getByRole('button', { name: 'Sign out' }).click();

  await expect(page).toHaveURL(/\/login/);

  // The session is genuinely gone, not just navigated away from.
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login/);
});

test('bad credentials are rejected without revealing whether the email exists', async ({
  page,
}) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill('owner@opsight.test');
  await page.getByLabel('Password').fill('wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText(/do not match our records/i)).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

/**
 * The test that justifies E2E existing at all: an end-to-end assertion about a
 * security boundary spanning both stacks (TESTING_STRATEGY.md §5, flow 5).
 */
test('staff never receive cost or expense surfaces', async ({ page }) => {
  await signIn(page, STAFF);

  // Navigation is ability-filtered, so these entries are absent from the DOM
  // entirely — not rendered and disabled, and not hidden with CSS.
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByText('Expenses')).toHaveCount(0);
  await expect(nav.getByText('Analytics')).toHaveCount(0);
  await expect(nav.getByText('Users')).toHaveCount(0);
  await expect(nav.getByText('Activity log')).toHaveCount(0);

  await expect(page.getByText(/not available for your role/i)).toBeVisible();

  // And the abilities themselves never crossed the wire.
  const abilities = await page.locator('li[class*="font-mono"]').allTextContents();
  expect(abilities.length).toBeGreaterThan(0);
  expect(abilities).not.toContain('metrics.view_cost');
  expect(abilities).not.toContain('expenses.view');
  expect(abilities.some((a) => a.includes('.export'))).toBe(false);
});

test('an owner does receive the cost surfaces staff do not', async ({ page }) => {
  await signIn(page, OWNER);

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByText('Expenses')).toBeVisible();
  await expect(nav.getByText('Analytics')).toBeVisible();
  await expect(nav.getByText('Users')).toBeVisible();
  await expect(page.getByText(/can see cost, margin and profit/i)).toBeVisible();
});
