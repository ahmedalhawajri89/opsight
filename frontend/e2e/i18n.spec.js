import { expect, test } from '@playwright/test';

import { authFile } from './support/authState';

/**
 * Arabic, through a real browser against a real backend.
 *
 * What only an end-to-end test can show: that the choice is saved on the
 * account and survives a reload, that the page is laid out right to left from
 * its first byte, and that the server's own figures and the client's labels
 * arrive in the same language and the same digits.
 *
 * The database is shared by every spec, so a test that switches an account to
 * Arabic puts it back in `finally` — a failure half way must not leave the
 * rest of the suite reading a page in a language it does not expect.
 */

const API = process.env.E2E_API_URL ?? 'http://localhost:8010';

/** Saves preferences through the API with the page's own session and CSRF token. */
async function savePreferences(page, preferences) {
  return page.evaluate(
    async ({ api, body }) => {
      const token = decodeURIComponent(
        document.cookie
          .split('; ')
          .find((cookie) => cookie.startsWith('XSRF-TOKEN='))
          ?.split('=')[1] ?? '',
      );

      const response = await fetch(`${api}/api/v1/me/preferences`, {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-XSRF-TOKEN': token,
        },
        body: JSON.stringify(body),
      });

      return response.status;
    },
    { api: API, body: preferences },
  );
}

test.describe('a signed-in user choosing Arabic', () => {
  test.use({ storageState: authFile('manager') });

  test('is saved to the account, lays the page out right to left and survives a reload', async ({
    page,
  }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

    try {
      const saved = () =>
        page.waitForResponse(
          (response) =>
            response.url().includes('/me/preferences') && response.request().method() === 'PATCH',
        );

      // Language and digits live in the account menu and apply at once.
      await page.getByRole('button', { name: /^Account:/ }).click();
      let response = saved();
      await page.getByRole('button', { name: 'العربية' }).click();
      expect((await response).status()).toBe(200);

      // The page re-renders in Arabic, so the menu is opened again, by its Arabic name.
      await page.getByRole('button', { name: /^الحساب:/ }).click();
      response = saved();
      await page.getByRole('button', { name: 'عربية مشرقية' }).click();
      expect((await response).status()).toBe(200);

      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
      await expect(page.getByRole('heading', { name: 'لوحة المعلومات' })).toBeVisible();

      // Figures are written in the chosen digits.
      await expect(page.getByRole('heading', { name: 'الطلبات', level: 3 })).toBeVisible();
      await expect(page.locator('main')).toContainText(/[٠-٩]/);

      // A server-written sentence arrives in Arabic too.
      await expect(page.getByText(/مقارنة/).first()).toBeVisible();

      // Reload: the saved choice, and right-to-left from the first byte.
      await page.reload();
      await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.getByRole('heading', { name: 'لوحة المعلومات' })).toBeVisible();
    } finally {
      expect(await savePreferences(page, { locale: 'en', numerals: 'latn' })).toBe(200);
    }

    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('keeps Western digits by default', async ({ page }) => {
    await page.goto('/dashboard');

    try {
      // Numerals stated explicitly: this test is about the default for a new
      // choice of Arabic, and must not inherit digits a failed run left behind.
      expect(await savePreferences(page, { locale: 'ar', numerals: 'latn' })).toBe(200);
      await page.reload();

      await expect(page.getByRole('heading', { name: 'لوحة المعلومات' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'الطلبات', level: 3 })).toBeVisible();
      await expect(page.locator('main')).not.toContainText(/[٠-٩]/);
    } finally {
      expect(await savePreferences(page, { locale: 'en', numerals: 'latn' })).toBe(200);
    }
  });
});

test.describe('a visitor on the sign-in page', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('can read it in Arabic before signing in', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'العربية' }).click();

    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByLabel('البريد الإلكتروني')).toBeVisible();
    await expect(page.getByRole('button', { name: 'تسجيل الدخول' })).toBeVisible();

    // Remembered on this browser, so the next visit starts in Arabic.
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    await page.getByRole('button', { name: 'English' }).click();
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  /*
   * Asks Chrome which font actually DREW the Arabic heading — not which font
   * the CSS names, which is a different question.
   *
   * For the whole life of the project until this test existed, the Arabic face
   * downloaded on every page and drew nothing: Inter's metric fallback,
   * `local("Arial")`, sat ahead of it in the stack, and Arial has Arabic
   * glyphs. Computed `font-family` looked right the entire time; only the
   * platform-font report told the truth.
   */
  test('draws Arabic in DIN Next LT Arabic, not a system fallback', async ({
    page,
    context,
    baseURL,
  }) => {
    await context.addCookies([{ name: 'opsight_locale', value: 'ar', url: baseURL }]);
    await page.goto('/login');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.evaluate(() => document.fonts.ready.then(() => undefined));

    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const { root } = await cdp.send('DOM.getDocument');
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: 'h1',
    });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });

    const drawn = fonts.map((font) => font.familyName);
    expect(drawn, `the Arabic heading was drawn with: ${drawn.join(', ')}`).toContain(
      'DIN Next LT Arabic',
    );
    expect(drawn).not.toContain('Arial');
  });
});
