import { defineConfig, devices } from '@playwright/test';

/**
 * E2E runs against a real backend with a seeded database.
 *
 * Deliberately few specs. E2E tests are slow and flaky in proportion to their
 * number, so each one must cover a path no lower-level test can reach —
 * typically something that spans both stacks
 * (docs/architecture/TESTING_STRATEGY.md §5).
 *
 * The Laravel API must be running on :8010 with the database seeded:
 *   cd backend && php artisan migrate:fresh --seed && php artisan serve
 *   cd backend && php artisan db:seed --class=DemoDataSeeder
 */
export default defineConfig({
  testDir: './e2e',
  // support/ holds plain helpers, not specs.
  testIgnore: /support\//,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',

  /*
   * Ten seconds, not five.
   *
   * `php artisan serve` answers one request at a time, and the dashboard asks
   * for three things at once — figures, insights, activity — each about two
   * seconds against the seeded three-year history. The default budget left an
   * assertion waiting on the third while the first was still being computed,
   * which failed as "heading not found" and passed on a rerun. The wait is on
   * the data either way; this only stops a slow queue reading as a bug.
   */
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    // No waitForTimeout anywhere in the specs — wait on state, not the clock.
    actionTimeout: 10_000,
  },

  projects: [
    /*
     * Signs in once per role and saves the session (e2e/auth.setup.js).
     *
     * Without this every spec signed in for itself, which meant twenty-odd
     * logins in two minutes against an API that rate-limits login to ten per
     * minute — so the later specs failed with a 429 that vanished when they
     * were run alone. The limit is right; logging in twenty times was not.
     */
    { name: 'setup', testMatch: /auth\.setup\.js/ },

    {
      // Signing in, out and up is what these specs test, so they do it for real.
      name: 'anonymous',
      testMatch: /(auth|onboarding)\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'authenticated',
      testMatch: /(modules|gallery|analytics|admin|i18n|shell|tenancy|forms)\.spec\.js/,
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
  ],

  /*
   * A PRODUCTION build, not `next dev`.
   *
   * The dev server compiles each route on first request, so the first visit to
   * a page can take several seconds — long enough to blow an assertion timeout
   * and produce a failure that disappears when the test is run alone. Chasing
   * that as a flake wastes time; removing the cause does not. It also means the
   * suite exercises what actually ships.
   */
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // The component gallery is off unless explicitly enabled.
      NEXT_PUBLIC_ENABLE_GALLERY: 'true',
    },
  },
});
