/*
 * The service worker (ADR-028).
 *
 * IT CACHES NO DATA. NOT ONE FIGURE. EVER.
 *
 * This is the whole design, and it is worth being blunt about because every
 * service-worker tutorial on the internet says the opposite. A cache-first
 * worker in front of a business intelligence tool is a machine for showing
 * someone yesterday's revenue as though it were today's — silently, with no
 * banner, no stale marker, nothing. The product's entire claim is that its
 * figures are real and current. A worker that serves a cached `/api/v1/
 * analytics/dashboard` destroys that claim to save a round trip.
 *
 * So every request to the API goes to the network, and if the network is
 * gone the request fails, exactly as it does without a worker. The reader
 * sees the application's own error state, which says it could not reach the
 * server — true, useful, and already built.
 *
 * What it DOES cache is the shell: the JavaScript, the CSS and the fonts
 * that Next.js fingerprints by content. Those are immutable by construction
 * — a changed file has a different URL — so serving them from a cache can
 * never be stale. That is what makes an installed launch feel instant, and
 * it is the entire benefit being claimed here.
 *
 * A navigation offline falls back to a small page that says so. Not a
 * cached dashboard: a dashboard full of last week's numbers is worse than a
 * page that admits there is no connection.
 */
const VERSION = 'opsight-shell-v1';

/** Fingerprinted by content, so a cached copy can never be the wrong one. */
const IMMUTABLE = [/^\/_next\/static\//, /^\/icons\//, /\.(?:woff2|png|svg|ico)$/];

const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      // Replace the previous worker at once rather than waiting for every
      // tab to close: a worker that lingers is one serving the old shell.
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Anything that changes state goes straight out. A cached POST is not a
  // concept that should exist.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Another origin's problem — the API included, which lives on its own host.
  if (url.origin !== self.location.origin) return;

  // The API, wherever it is proxied: never cached. See the note above.
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE_URL).then((cached) => cached ?? Response.error()),
      ),
    );

    return;
  }

  const immutable = IMMUTABLE.some((pattern) => pattern.test(url.pathname));

  if (!immutable) return;

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ??
        fetch(request).then((response) => {
          // Only a clean response is kept: caching a 404 means serving it
          // until the version changes.
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy));
          }

          return response;
        }),
    ),
  );
});
