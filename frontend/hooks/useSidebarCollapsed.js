'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Whether the reader has folded the navigation down to its icons.
 *
 * NOT THE SAME THING AS THE RESPONSIVE RAIL, which CSS already does: below
 * 1024px the sidebar is a rail because 216px of names would cost the content
 * a fifth of a laptop screen. That is the layout deciding. This is the
 * reader deciding — on a wide screen, where there is room for the names and
 * they would still rather have the width.
 *
 * So the two compose rather than compete: collapsed means "a rail at every
 * width", and not collapsed means "whatever the width calls for".
 *
 * NOT THE SAME THING AS FOCUS MODE EITHER. Focus mode removes the
 * navigation for one stretch of work and is meant to be left; this is a
 * standing preference about how the application looks, and is meant to be
 * kept. Someone can hold both opinions at once.
 *
 * Read through `useSyncExternalStore` like every other browser-owned fact
 * here, and false on the server — a sidebar that renders expanded and then
 * snaps to a rail after hydration is a worse first frame than one that
 * arrives a moment late.
 */
const KEY = 'opsight:sidebar-collapsed';

const listeners = new Set();

function announce() {
  listeners.forEach((listener) => listener());
}

function subscribe(onChange) {
  listeners.add(onChange);

  // `storage` fires in OTHER tabs only, so the Set is what keeps this tab in
  // step; the listener covers a second window of the same application.
  window.addEventListener('storage', onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function read() {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    // Private browsing, or storage blocked. The preference stops persisting;
    // the navigation still works, which is the part that matters.
    return false;
  }
}

export function useSidebarCollapsed() {
  const collapsed = useSyncExternalStore(subscribe, read, () => false);

  const toggle = useCallback(() => {
    try {
      window.localStorage.setItem(KEY, read() ? '0' : '1');
    } catch {
      // See read().
    }

    announce();
  }, []);

  return [collapsed, toggle];
}
