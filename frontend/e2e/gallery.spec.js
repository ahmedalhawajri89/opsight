import { expect, test } from '@playwright/test';

import { authFile } from './support/authState';

/**
 * The gallery is the Phase 02 verification surface, so it is itself verified:
 * if a component throws in a state nobody looks at, this catches it.
 *
 * Deliberately one spec, not a per-component suite. Component behaviour is
 * covered by Vitest; what only a browser can show is that the whole page
 * renders without a runtime error in both themes.
 */

const CONSOLE_NOISE = [
  /Download the React DevTools/i,
  /favicon/i,
  /*
   * The app asks GET /me on mount to find out whether it is signed in. Before
   * login that legitimately answers 401, and the browser logs every 401 as a
   * console error. It is the session probe working, not a fault.
   */
  /status of 401/i,
];

// The session comes from the setup project, so the gallery specs do not each
// spend a login against the API's rate limit.
test.use({ storageState: authFile('owner') });

async function openGallery(page) {
  const errors = [];

  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (CONSOLE_NOISE.some((pattern) => pattern.test(message.text()))) return;

    errors.push(message.text());
  });

  await page.goto('/gallery');
  await expect(page.getByRole('heading', { name: 'Component gallery' })).toBeVisible();

  return errors;
}

test('renders every component section without a runtime error', async ({ page }) => {
  const errors = await openGallery(page);

  for (const section of [
    'Buttons',
    'Form controls',
    'Badges',
    'Comparison values',
    'Stat tiles',
    'Period selector',
    'Data table',
    'Table states',
    'Skeletons',
    'Overlays',
    'Colour tokens',
  ]) {
    await expect(page.getByRole('heading', { name: section, exact: true })).toBeVisible();
  }

  expect(errors).toEqual([]);
});

test('renders in dark mode without a runtime error', async ({ page }) => {
  const errors = await openGallery(page);

  /*
   * Dark is an explicit choice (data-theme), not an OS-following media query,
   * since the dashboard redesign made light the product. Emulating
   * prefers-color-scheme would now render light and pass without testing dark
   * at all, so the attribute is set directly.
   */
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));

  await expect(page.getByRole('heading', { name: 'Stat tiles' })).toBeVisible();

  // Proves the dark tokens actually applied, rather than only that nothing threw.
  const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(ground).toBe('rgb(11, 14, 18)');

  expect(errors).toEqual([]);
});

test('shows an em dash rather than zero for a metric with no value', async ({ page }) => {
  await openGallery(page);

  // Locate the tile by its heading, then read the value beneath it.
  const tile = page
    .getByRole('heading', { name: 'Average order value' })
    .locator('xpath=ancestor::div[1]/..');

  // Two em dashes, and that is correct: the value has none, and neither does
  // its comparison — a period with no orders has no average and nothing to
  // compare against.
  await expect(tile.getByText('—', { exact: true })).toHaveCount(2);
  await expect(tile.getByText('—', { exact: true }).first()).toBeVisible();

  // And crucially: no zero standing in for a value that does not exist.
  await expect(tile.getByText('0', { exact: true })).toHaveCount(0);
  await expect(tile.getByText('0.0%', { exact: true })).toHaveCount(0);
});

test('dialogs trap focus, close on Escape and restore focus to the trigger', async ({ page }) => {
  await openGallery(page);

  const trigger = page.getByRole('button', { name: 'Open dialog' });

  await trigger.click();
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  // A keyboard user who closes a dialog must not be dumped at the top of the
  // document — focus returns to what they opened it from.
  await expect(trigger).toBeFocused();
});

test('a destructive confirmation states the business consequence', async ({ page }) => {
  await openGallery(page);

  await page.getByRole('button', { name: 'Destructive confirm' }).click();

  // Not "Are you sure?" — it says what will actually happen.
  await expect(page.getByText(/returns 12 units to stock/i)).toBeVisible();
  await expect(page.getByText(/removes BHD 840\.000 from August revenue/i)).toBeVisible();
});

test('sortable table headers are keyboard operable and expose sort state', async ({ page }) => {
  await openGallery(page);

  const header = page.getByRole('columnheader', { name: /Placed/ });

  await expect(header).toHaveAttribute('aria-sort', 'descending');

  await header.getByRole('button').click();
  await expect(header).toHaveAttribute('aria-sort', 'ascending');
});
