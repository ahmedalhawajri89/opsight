'use client';

import { useCallback, useEffect, useSyncExternalStore } from 'react';

/**
 * Giving the screen over to the figures (UI_UX_DIRECTION.md).
 *
 * TWO THINGS THAT SOUND LIKE ONE, and keeping them separate is the point.
 *
 * **Focus** hides this application's own furniture — the sidebar and the top
 * bar's interruptions — and lets the content have the width. It is ours to
 * give, it works everywhere, and it survives a reload because it is a
 * preference.
 *
 * **Fullscreen** is the browser's, through the Fullscreen API, and it hides
 * the browser: tabs, address bar, the lot. It cannot be entered without a
 * user gesture, a permissions policy can forbid it, and the reader can leave
 * it with Escape without telling us — so it is never stored, only observed.
 *
 * Asking for fullscreen turns focus on as well, because a reader who wants
 * the whole screen did not mean "the whole screen, with a sidebar". Leaving
 * fullscreen does NOT turn focus off: they asked for two things and only
 * cancelled one.
 *
 * Escape is deliberately not bound. The browser already uses it to leave
 * fullscreen, and binding it to leave focus as well would make one press do
 * two things — the reader presses Escape expecting the browser back and
 * loses their layout with it.
 *
 * Both states are read through `useSyncExternalStore`, like every other
 * browser-owned fact in this codebase (useMediaQuery, useReducedMotion).
 * The browser is the source of truth for fullscreen and localStorage is for
 * the preference; mirroring either into React state would mean two answers
 * to one question, and the stale one would win about half the time.
 */
const STORAGE_KEY = 'opsight:focus-mode';

/** localStorage fires no event in the tab that wrote it, so we keep our own. */
const listeners = new Set();

function announce() {
  listeners.forEach((listener) => listener());
}

function subscribeToPreference(onChange) {
  listeners.add(onChange);
  // `storage` fires only in OTHER tabs — which is exactly right: focus mode
  // chosen in one tab should follow into the next one the reader opens.
  window.addEventListener('storage', onChange);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function readPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private browsing, or storage blocked. A preference that cannot be
    // saved is not a reason to fail; it just does not persist.
    return false;
  }
}

function writePreference(next) {
  try {
    window.localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
  } catch {
    // See readPreference.
  }

  announce();
}

function subscribeToFullscreen(onChange) {
  document.addEventListener('fullscreenchange', onChange);

  return () => document.removeEventListener('fullscreenchange', onChange);
}

/**
 * @param {() => void} [onBeforeChange]  Run synchronously before the
 *   preference is written, whichever path writes it — the button or the
 *   shortcut. The shell uses it to measure the layout it is about to lose.
 *   **It must be stable**, or the shortcut's listener re-subscribes on every
 *   render; wrap it in useCallback.
 */
export function useFocusMode(onBeforeChange) {

  /*
   * Focus is off on the server and on the first client render. Reading
   * localStorage during render would make the server's HTML disagree with
   * the browser's first paint, and React discards the whole tree when they
   * differ — so the preference arrives on the render after hydration, which
   * is one frame nobody sees.
   */
  const focused = useSyncExternalStore(subscribeToPreference, readPreference, () => false);

  const fullscreen = useSyncExternalStore(
    subscribeToFullscreen,
    () => document.fullscreenElement !== null,
    () => false,
  );

  const supported = useSyncExternalStore(
    () => () => {},
    () => document.fullscreenEnabled === true,
    () => false,
  );

  const toggleFocus = useCallback(() => {
    onBeforeChange?.();
    writePreference(!readPreference());
  }, [onBeforeChange]);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement !== null) {
        await document.exitFullscreen();

        return;
      }

      await document.documentElement.requestFullscreen();
      /*
       * Asked for the whole screen: the sidebar is not part of that.
       *
       * No onBeforeChange here, unlike the two paths above. The browser is
       * already animating the viewport into fullscreen, and a layout tween
       * measured against the pre-fullscreen window would be playing against
       * a box that no longer exists.
       */
      writePreference(true);
    } catch {
      /*
       * Refused by a permissions policy, or the gesture was not recognised.
       * Focus mode still works, so this is not worth an error message — the
       * button simply does not take, and the state below re-reads the truth.
       */
      announce();
    }
  }, []);

  /*
   * One shortcut, and it is the application's own: Shift+F. A bare F would
   * fire while someone typed an SKU into the search box, and Ctrl/Cmd+F is
   * the browser's find — taking that from a reader is the kind of theft that
   * makes an application feel hostile.
   */
  useEffect(() => {
    const onKey = (event) => {
      if (!event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== 'F' && event.key !== 'f') return;

      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

      if (typing) return;

      event.preventDefault();
      onBeforeChange?.();
      writePreference(!readPreference());
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [onBeforeChange]);

  return { focused, fullscreen, supported, toggleFocus, toggleFullscreen };
}
