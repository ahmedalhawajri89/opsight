'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker, and only in production (ADR-028).
 *
 * In development a worker serving a cached shell is a machine for making
 * you debug code you already changed — `next dev` recompiles on save and
 * the worker hands back the version from before. The one environment where
 * an aggressive cache helps is the one where the files never change.
 *
 * Registered after the page has loaded rather than during it: fetching and
 * installing a worker competes for bandwidth with the figures the reader
 * actually came for, and nothing about the first visit depends on it.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return undefined;
    if (!('serviceWorker' in navigator)) return undefined;

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
