import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
|--------------------------------------------------------------------------
| What the service worker is allowed to keep
|--------------------------------------------------------------------------
|
| One rule carries this whole file: A FIGURE IS NEVER CACHED. A cache-first
| worker in front of a business intelligence tool is a machine for showing
| someone yesterday's revenue as though it were today's — silently, with no
| stale marker and nothing to notice. Every service-worker tutorial on the
| internet says to cache your API responses; here that would destroy the
| product's only real claim.
|
| The worker is a plain script rather than a module, so it is read and run
| against a stub `self`. That is deliberate: testing the real file means a
| rule cannot be quietly relaxed in the worker without this failing.
|
*/

const SOURCE = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8');

/** Runs the worker against a fake global and returns its handlers. */
function bootWorker() {
  const handlers = {};
  const caches = {
    open: vi.fn().mockResolvedValue({ addAll: vi.fn().mockResolvedValue(undefined), put: vi.fn() }),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue(undefined),
  };

  const self = {
    addEventListener: (type, handler) => {
      handlers[type] = handler;
    },
    skipWaiting: vi.fn().mockResolvedValue(undefined),
    clients: { claim: vi.fn().mockResolvedValue(undefined) },
    location: { origin: 'https://opsight.test' },
  };

  // A fetch that resolves: the worker chains .then and .catch onto it, and
  // a stub returning undefined would fail for a reason that has nothing to
  // do with the rules under test.
  const fetch = vi.fn().mockResolvedValue({ ok: true, clone: () => ({}) });

  new Function('self', 'caches', 'fetch', 'Response', 'URL', SOURCE)(
    self,
    caches,
    fetch,
    { error: vi.fn() },
    URL,
  );

  return { handlers, caches, self };
}

/** Did the worker take over this request, or let it through to the network? */
function intercepts(handlers, request) {
  let intercepted = false;

  handlers.fetch({
    request,
    respondWith: () => {
      intercepted = true;
    },
    waitUntil: () => {},
  });

  return intercepted;
}

const get = (url, mode = 'no-cors') => ({ method: 'GET', url, mode });

describe('the service worker', () => {
  let handlers;

  beforeEach(() => {
    ({ handlers } = bootWorker());
  });

  it('never takes over a request for a figure', () => {
    // The rule the whole design turns on.
    expect(intercepts(handlers, get('https://opsight.test/api/v1/analytics/dashboard'))).toBe(false);
    expect(intercepts(handlers, get('https://opsight.test/api/v1/orders'))).toBe(false);
    expect(intercepts(handlers, get('https://opsight.test/api/health'))).toBe(false);
  });

  it('never takes over a request to the API on its own host', () => {
    // In production the API is a sibling origin, not a path. Another
    // origin's responses are not ours to keep under any circumstances.
    expect(intercepts(handlers, get('https://api.opsight.test/v1/analytics/dashboard'))).toBe(false);
  });

  it('leaves anything that changes state entirely alone', () => {
    const post = { method: 'POST', url: 'https://opsight.test/api/v1/orders', mode: 'cors' };

    expect(intercepts(handlers, post)).toBe(false);
  });

  it('serves the shell from its cache, because those files cannot go stale', () => {
    /*
     * Next.js fingerprints these by content: a changed file has a different
     * URL. Serving them from a cache can never hand back the wrong one,
     * which is the entire benefit being claimed.
     */
    expect(intercepts(handlers, get('https://opsight.test/_next/static/chunks/main-a1b2c3.js'))).toBe(true);
    expect(intercepts(handlers, get('https://opsight.test/icons/icon-192.png'))).toBe(true);
    expect(intercepts(handlers, get('https://opsight.test/fonts/IBMPlexSansArabic-400.woff2'))).toBe(true);
  });

  it('answers a navigation it cannot reach with a page that says so', () => {
    // Not a cached dashboard. A screen of last week's numbers is worse than
    // one that admits there is no connection.
    expect(intercepts(handlers, get('https://opsight.test/dashboard', 'navigate'))).toBe(true);
  });

  it('lets an ordinary page request through rather than guessing', () => {
    expect(intercepts(handlers, get('https://opsight.test/some/other/thing'))).toBe(false);
  });

  it('takes over from the previous worker at once', async () => {
    const { handlers: fresh, self } = bootWorker();

    // Awaited: install finishes on a microtask, and a synchronous assertion
    // would be checking before the worker had done anything.
    let work;
    fresh.install({ waitUntil: (promise) => { work = promise; } });
    await work;

    // A lingering worker is one still serving the old shell after a deploy.
    expect(self.skipWaiting).toHaveBeenCalled();
  });
});
