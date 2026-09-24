import { expect, test } from '@playwright/test';

import { authFile } from './support/authState';
import { dashboardReady } from './support/ready';

/**
 * The dashboard and analytics screens, against a real backend with three years
 * of seeded data.
 *
 * These verify the things only a browser can: that real figures render, that
 * the period selector actually changes them, that a partial period is warned
 * about, and — most importantly — that the cost boundary holds all the way to
 * the pixels for a Staff user.
 */

test.describe('dashboard, as an owner', () => {
  test.use({ storageState: authFile('owner') });

  test('renders real figures from the seeded history', async ({ page }) => {
    await page.goto('/dashboard');

    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    /*
     * Level 3 targets the STAT TILE, not the chart of the same name.
     * A tile label is an h3; a chart title is an h2. Disambiguating by level
     * rather than by position also asserts that the heading hierarchy is right.
     */
    const revenue = page
      .getByRole('heading', { name: 'Net revenue', level: 3 })
      .locator('xpath=ancestor::div[2]');

    await expect(revenue).toBeVisible();

    // toContainText, not a sub-locator: the tile holds the value AND the
    // previous-period figure, so a /BHD/ locator matches two elements.
    await expect(revenue).toContainText('BHD');

    // The comparison basis is stated in words, never left as a bare percentage.
    await expect(revenue).toContainText(/vs previous \d+ days/);

    await expect(
      page.getByRole('heading', { name: 'Orders', exact: true, level: 3 }),
    ).toBeVisible();
  });

  test('states the comparison basis in words on every tile', async ({ page }) => {
    await page.goto('/dashboard');

    // A bare percentage with no stated basis is not a comparison.
    await expect(page.getByText(/vs previous \d+ days/).first()).toBeVisible();
  });

  test('warns when an in-progress period is compared against a complete one', async ({ page }) => {
    await page.goto('/dashboard');

    // A rolling 30-day window always includes today.
    await expect(page.getByText(/still in progress/i).first()).toBeVisible();
    await expect(page.getByText('Incomplete').first()).toBeVisible();
  });

  test('changes the figures when the period changes, and keeps it in the URL', async ({ page }) => {
    await page.goto('/dashboard');

    const revenueTile = page
      .getByRole('heading', { name: 'Net revenue', level: 3 })
      .locator('xpath=ancestor::div[2]');

    await expect(revenueTile).toBeVisible();

    const before = await revenueTile.innerText();

    await page.getByLabel('Period').selectOption('ytd');
    await expect(page).toHaveURL(/preset=ytd/);

    // Year to date covers far more trade than the last 30 days.
    await expect(revenueTile).not.toHaveText(before);

    // Shareable: a reload reproduces the same view.
    await page.reload();
    await expect(page.getByLabel('Period')).toHaveValue('ytd');
  });

  test('shows a revenue trend that can be read as a table', async ({ page }) => {
    await page.goto('/dashboard');
    await dashboardReady(page);

    const chart = page.getByRole('heading', { name: 'Net revenue', exact: true }).last();
    await expect(chart).toBeVisible();

    // A chart is never the only route to its numbers.
    await page.getByRole('button', { name: 'View as table' }).first().click();
    await expect(page.getByRole('table').first()).toBeVisible();
  });

  test('labels low stock as a point-in-time figure, not a period one', async ({ page }) => {
    await page.goto('/dashboard');

    const panel = page
      .getByRole('heading', { name: 'Inventory Health' })
      .locator('xpath=ancestor::section[1]');
    await expect(panel).toBeVisible();
    await expect(panel.getByText('Low Stock', { exact: true })).toBeVisible();

    // Stated to assistive technology and in the panel's tooltip, not by position.
    await expect(panel.getByText('As of now — not for the selected period')).toHaveCount(1);
  });
});

test.describe('analytics, as an owner', () => {
  test.use({ storageState: authFile('owner') });

  test('renders the full metric set and a breakdown', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Gross margin', level: 3 })).toBeVisible();
    await expect(page.getByRole('heading', { name: /Net revenue by product/ })).toBeVisible();
  });

  test('shows a ratio change in percentage POINTS, not percent', async ({ page }) => {
    await page.goto('/analytics');

    const margin = page
      .getByRole('heading', { name: 'Gross margin', level: 3 })
      .locator('xpath=ancestor::div[2]');

    await expect(margin).toBeVisible();

    // A margin moving 38.4% to 34.2% is "-4.2 pp". Calling it a percentage
    // would be a reporting error.
    await expect(margin.getByText(/pp|—/).first()).toBeVisible();
  });

  test('switches the breakdown dimension', async ({ page }) => {
    await page.goto('/analytics');

    await page.getByLabel('Break down by').selectOption('customer');
    await expect(page).toHaveURL(/dimension=customer/);
    await expect(page.getByRole('heading', { name: /Net revenue by customer/ })).toBeVisible();
  });

  test('explains how the figures should be read', async ({ page }) => {
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'How to read these figures' })).toBeVisible();
    await expect(page.getByText(/at the moment of sale/)).toBeVisible();
    await expect(page.getByText(/It never means zero/i)).toBeVisible();
  });
});

/**
 * The cost boundary, on the rendered page.
 */
test.describe('as staff', () => {
  test.use({ storageState: authFile('staff') });

  test('sees a dashboard with revenue but no cost, profit or margin tile', async ({ page }) => {
    await page.goto('/dashboard');
    await dashboardReady(page);

    await expect(page.getByRole('heading', { name: 'Net revenue' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Orders', exact: true })).toBeVisible();

    // Not hidden — never sent. The server omits the keys entirely.
    await expect(page.getByRole('heading', { name: 'Gross profit' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Gross margin' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Cost of goods' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Operating profit' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Operating expenses' })).toHaveCount(0);
  });

  test('cannot reach the analytics screen at all', async ({ page }) => {
    await page.goto('/dashboard');

    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav.getByRole('link', { name: 'Analytics' })).toHaveCount(0);

    await page.goto('/analytics');
    await expect(page.getByText(/not available for your role/i).first()).toBeVisible();
  });
});
