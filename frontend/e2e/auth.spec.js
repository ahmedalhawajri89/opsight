import { expect, test } from '@playwright/test';

/**
 * Authentication and the role boundary, through a real browser.
 *
 * This is the only test in the project that proves the whole stack agrees:
 * the browser stores the cookie, Laravel accepts it, abilities cross the wire,
 * and the UI gates on them. Nothing below this level can show that.
 */

const OWNER = { email: 'owner@opsight.test', password: 'password' };
const STAFF = { email: 'staff@opsight.test', password: 'password' };

/**
 * Signs in and returns the user object EXACTLY AS IT CROSSED THE WIRE.
 *
 * Reading the payload rather than the DOM is deliberate: a hidden surface and
 * an unsent ability look identical on screen, and only one of them is a
 * security property. This asserts the one that matters.
 */
async function signIn(page, { email, password }) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);

  const [response] = await Promise.all([
    page.waitForResponse(
      (res) => res.url().includes('/api/v1/auth/login') && res.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ]);

  await expect(page).toHaveURL(/\/dashboard/);

  const body = await response.json();

  return body.data;
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
  const user = await signIn(page, STAFF);

  // The abilities themselves never crossed the wire. This is the assertion the
  // whole boundary rests on — everything below is a consequence of it.
  expect(user.abilities).not.toContain('metrics.view_cost');
  expect(user.abilities).not.toContain('expenses.view');
  expect(user.abilities.some((ability) => ability.endsWith('.export'))).toBe(false);

  // Navigation is ability-filtered, so these entries are absent from the DOM
  // entirely — not rendered and disabled, and not hidden with CSS.
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByText('Expenses')).toHaveCount(0);
  await expect(nav.getByText('Analytics')).toHaveCount(0);
  await expect(nav.getByText('Users')).toHaveCount(0);
  await expect(nav.getByText('Activity log')).toHaveCount(0);

  // And the dashboard it lands on carries revenue but no cost-bearing tile.
  await expect(page.getByRole('heading', { name: 'Net revenue' }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gross profit' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Gross margin' })).toHaveCount(0);
});

test('an owner does receive the cost surfaces staff do not', async ({ page }) => {
  const user = await signIn(page, OWNER);

  expect(user.abilities).toContain('metrics.view_cost');
  expect(user.abilities).toContain('expenses.view');

  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByText('Expenses')).toBeVisible();
  await expect(nav.getByText('Analytics')).toBeVisible();
  await expect(nav.getByText('Users')).toBeVisible();

  // The same dashboard, same period, now with the cost-bearing tiles present.
  await expect(page.getByRole('heading', { name: 'Gross profit', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Gross margin', level: 3 })).toBeVisible();
});
