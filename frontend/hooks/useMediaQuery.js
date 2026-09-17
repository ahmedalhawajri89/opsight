'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether a media query matches, kept in sync as the window changes.
 *
 * For layout decisions CSS cannot make on its own — where a control is
 * RENDERED, not merely how it looks. Rendering the same labelled control twice
 * and hiding one with CSS would leave two "Period" selects in the document.
 * Before hydration there is no window, and the answer is `false`.
 */
export function useMediaQuery(query) {
  const subscribe = useCallback(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener('change', onChange);

      return () => media.removeEventListener('change', onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
