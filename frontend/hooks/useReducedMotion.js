'use client';

import { useSyncExternalStore } from 'react';

/**
 * Whether the reader has asked the operating system for less motion.
 *
 * CSS animations honour the preference through a media query in globals.css.
 * Recharts animates from JavaScript and never sees that query, so chart
 * components read the preference here and switch their animation off.
 *
 * Subscribed rather than read once, so changing the setting while the page is
 * open takes effect on the next render. On the server there is no preference to
 * read, and "reduced" is the safe answer: nothing animates before hydration.
 */
const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange) {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);

  return () => media.removeEventListener('change', onChange);
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => true,
  );
}
