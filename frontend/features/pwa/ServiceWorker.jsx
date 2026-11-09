'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker in production — and tears it down everywhere
 * else (ADR-036).
 *
 * In development a worker serving a cached shell is a machine for making
 * you debug code you already changed — `next dev` recompiles on save and
 * the worker hands back the version from before. The one environment where
 * an aggressive cache helps is the one where the files never change.
 *
 * WHY DEVELOPMENT UNREGISTERS RATHER THAN SIMPLY SKIPPING.
 *
 * This used to return early in development, which sounds like the same
 * thing and is not. A worker is registered against an ORIGIN and stays
 * registered until something removes it; a later page that declines to
 * register one does not remove anything. And this project puts a production
 * build on the development origin as a matter of routine — the browser
 * suite's `webServer` runs `npm run build && npm run start` on
 * localhost:3000 (playwright.config.mjs). So one `npx playwright test` left
 * a worker installed on the port `npm run dev` serves from, permanently.
 *
 * That worker then kept its side of the bargain and still produced a broken
 * page, because the bargain itself does not hold in development. It caches
 * `/_next/static/` on the stated grounds that Next fingerprints those files
 * by content, so a changed file has a different URL (public/sw.js). True of
 * `next build`. NOT true of `next dev`, which serves chunks from stable
 * paths and changes what is behind them on every save. The result was a
 * page assembled from two different builds weeks apart: the current markup
 * asking a months-old dictionary for keys it had never heard of, and a
 * stylesheet whose class names no longer matched anything — so the sign-in
 * page rendered unstyled, under the product's previous name, with raw
 * translation keys where sentences belonged.
 *
 * Unregistering is therefore not tidiness. It is the only thing that can
 * end that state from inside the application, and it has to run on the
 * origin the worker is attached to, which is exactly where this component
 * already is. The caches go with it: an unregistered worker stops answering
 * fetches, but its Cache Storage survives, and leaving a dead copy of an
 * old build on disk is how this comes back the next time someone registers
 * a worker here.
 *
 * Registered after the page has loaded rather than during it: fetching and
 * installing a worker competes for bandwidth with the figures the reader
 * actually came for, and nothing about the first visit depends on it.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    if (process.env.NODE_ENV !== 'production') {
      /*
       * One reload is still needed after this runs: the page you are looking
       * at was already served by the worker being removed. It is the last
       * one that will be.
       */
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
          Promise.all(registrations.map((registration) => registration.unregister())),
        )
        .then(() => ('caches' in window ? caches.keys() : []))
        .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
        .catch(() => {
          // Storage denied, or the browser refuses to enumerate it. Nothing
          // here is recoverable from the page, and nothing depends on it.
        });

      return undefined;
    }

    const register = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        /*
         * Blocked by a policy, served over plain HTTP, or storage is full.
         * The application works without it — the worker only makes a repeat
         * launch faster — so a failure here is not worth telling anyone
         * about.
         */
      });
    };

    if (document.readyState === 'complete') {
      register();

      return undefined;
    }

    window.addEventListener('load', register);

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
