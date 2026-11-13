'use client';

import { useSyncExternalStore } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { createLoadTracker } from '@/lib/loadTracker';

const IDLE = { active: false, progress: 1, started: 0 };
const trackers = new WeakMap();

/** One tracker per query client, shared by every loader on the page. */
function trackerFor(client) {
  let tracker = trackers.get(client);

  if (!tracker) {
    tracker = createLoadTracker(client);
    trackers.set(client, tracker);
  }

  return tracker;
}

/**
 * `{ active, progress, started }` for everything the application is loading
 * right now (lib/loadTracker). Idle on the server.
 */
export function useLoadProgress() {
  const client = useQueryClient();

  return useSyncExternalStore(
    (listener) => trackerFor(client).subscribe(listener),
    () => trackerFor(client).getSnapshot(),
    () => IDLE,
  );
}
