'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Something shown once, then never again.
 *
 * The discipline this enforces is that DISMISSAL IS PERMANENT. A hint that
 * comes back is not a hint, it is a nag, and the second showing teaches a
 * reader that dismissing anything in this application is pointless — which
 * they then apply to the messages that matter.
 *
 * Read through `useSyncExternalStore` like every other browser-owned fact
 * here, and false on the server: a hint must never be in the first paint,
 * or it flashes for everyone who has already dismissed it.
 *
 * `visits` is for the things that should wait. An invitation to install on
 * someone's first ten seconds is asking for a commitment before they know
 * whether they want one; `after` holds it back until they have come back.
 */
const listeners = new Set();

function announce() {
  listeners.forEach((listener) => listener());
}

function subscribe(onChange) {
  listeners.add(onChange);

  return () => listeners.delete(onChange);
}

function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private browsing, or storage blocked. Nothing is remembered, so the
    // honest behaviour is to show nothing rather than show it every time.
    return 'dismissed';
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // See read().
  }

  announce();
}

/**
 * @param {string} name   Distinguishes this hint from every other.
 * @param {number} after  Visits to wait before it may appear at all.
 * @returns {[boolean, () => void]} whether to show it, and how to end it
 */
export function useSeenOnce(name, { after = 0 } = {}) {
  const key = `opsight:seen:${name}`;
  const visitsKey = 'opsight:visits';

  const state = useSyncExternalStore(
    subscribe,
    () => `${read(key) ?? ''}|${read(visitsKey) ?? '0'}`,
    () => 'dismissed|0',
  );

  const [seen, visits] = state.split('|');
  const show = seen !== 'dismissed' && Number(visits) >= after;

  const dismiss = useCallback(() => write(key, 'dismissed'), [key]);

  return [show, dismiss];
}

/**
 * Counts this visit, once per browser session.
 *
 * Per SESSION, not per render or per navigation: moving between screens is
 * not coming back, and counting it would mean a reader who browses for five
 * minutes gets asked to install the application before they have finished
 * their first look.
 */
export function recordVisit() {
  try {
    if (window.sessionStorage.getItem('opsight:counted') === '1') return;

    window.sessionStorage.setItem('opsight:counted', '1');

    const visits = Number(window.localStorage.getItem('opsight:visits') ?? '0');
    window.localStorage.setItem('opsight:visits', String(visits + 1));
    announce();
  } catch {
    // Storage unavailable: the counter stays at zero and anything waiting
    // on it simply never appears, which is the quiet failure to prefer.
  }
}
