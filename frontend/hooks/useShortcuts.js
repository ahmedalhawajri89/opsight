'use client';

import { useEffect, useRef } from 'react';

/**
 * The application's keyboard layer: one listener, one map.
 *
 * There were three independent `keydown` listeners on `window` before this —
 * search, focus mode, and the navigation drawer's Escape — each deciding for
 * itself what counts as "the reader is typing". A fourth would have been the
 * point at which two of them disagreed and one shortcut started firing inside
 * a text field. This is where any new one goes.
 *
 * **Chords, because single letters belong to the page.** `g` then `o` opens
 * orders. A bare `o` could not: a reader tabbing through a table has their
 * hands over the letters, and a product search field is one Tab away on most
 * screens. The prefix is held for {@link CHORD_MS}, which is long enough to
 * be deliberate and short enough that a forgotten `g` does not hijack the
 * next thing typed.
 *
 * **Nothing fires while the reader is typing.** Inputs, textareas, selects
 * and anything `contentEditable` are left alone — including `?`, which is a
 * character someone may genuinely want in a search box.
 *
 * Modified keys are never taken. Ctrl/⌘ combinations belong to the browser,
 * and taking Ctrl+F or Ctrl+P from someone is the kind of theft that makes an
 * application feel hostile. The one exception in this codebase is Ctrl/⌘+K,
 * which has no browser meaning and is the convention everywhere else.
 *
 * @param {object} handlers
 * @param {() => void} handlers.onHelp  Runs on `?`.
 * @param {Record<string, () => void>} handlers.chords  Lower-case second key
 *   of a `g` chord, mapped to what it does. Stable, or the listener
 *   re-subscribes on every render.
 */
export function useShortcuts({ onHelp, chords }) {
  /*
   * The pending prefix and its timer, in refs rather than state: a half-typed
   * chord changes nothing on the screen, and re-rendering the whole shell
   * between `g` and `o` would be work nobody asked for.
   */
  const pending = useRef(false);
  const timer = useRef(null);

  useEffect(() => {
    function clearPending() {
      pending.current = false;

      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
    }

    function onKey(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const target = event.target;

      if (
        target instanceof HTMLElement &&
        (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      ) {
        return;
      }

      const key = event.key.toLowerCase();

      if (pending.current) {
        const run = chords[key];

        clearPending();

        if (run) {
          event.preventDefault();
          run();
        }

        return;
      }

      if (key === 'g' && !event.shiftKey) {
        /*
         * Not prevented. `g` on its own does nothing in a browser, and
         * swallowing it would break a page that wanted it — the chord only
         * commits once its second key lands.
         */
        pending.current = true;
        timer.current = window.setTimeout(clearPending, CHORD_MS);

        return;
      }

      if (key === '?') {
        event.preventDefault();
        onHelp();
      }
    }

    window.addEventListener('keydown', onKey);

    return () => {
      clearPending();
      window.removeEventListener('keydown', onKey);
    };
  }, [onHelp, chords]);
}

/** How long a `g` waits for its second key. */
const CHORD_MS = 1200;
