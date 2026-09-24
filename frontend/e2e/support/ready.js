/**
 * Waiting for the screen's own data, rather than for a timeout to expire.
 *
 * The dashboard asks for three things at once — its figures, its insights and
 * the activity feed — and each takes about two seconds against the seeded
 * history. `php artisan serve` answers one request at a time, so they queue,
 * and an assertion with the default five-second budget can be waiting on the
 * third while the first is still being computed.
 *
 * Waiting for the response makes the test fail for the right reason: if the
 * data never arrives, it says so, instead of reporting a missing heading.
 */
export async function dashboardReady(page, timeout = 30_000) {
  await page.waitForResponse(
    (response) =>
      response.url().includes('/api/v1/dashboard') && response.request().method() === 'GET',
    { timeout },
  );
}
