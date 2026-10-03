'use client';

import { useEffect, useState } from 'react';

/**
 * A value that lags behind the one given, so typing does not become traffic.
 *
 * Every keystroke in a search box would otherwise be a request: eight requests
 * to type a SKU, seven of which are already stale when they arrive, and the
 * last one not necessarily last to come back.
 *
 * 200ms is the figure the global search has used since it was written — short
 * enough that a reader who pauses sees results immediately, long enough that a
 * whole word is one request.
 */
export function useDebouncedValue(value, delay = 200) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
