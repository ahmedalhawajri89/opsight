'use client';

import { useCallback, useLayoutEffect, useReducer, useRef } from 'react';
import { gsap } from 'gsap';
import { Flip } from 'gsap/Flip';

import { useReducedMotion } from '@/hooks/useReducedMotion';

/*
 * Registered once, at module scope. Calling registerPlugin inside a component
 * would run it on every mount; GSAP tolerates that, but it also hides the fact
 * that this is a one-time setup and invites someone to register a second
 * plugin somewhere else.
 */
gsap.registerPlugin(Flip);

/**
 * The one place GSAP's Flip plugin is allowed to touch the page.
 *
 * `useGsap` animates an element from a state we invent. Flip animates it
 * between two states the LAYOUT produced — a panel that was 216px wide and is
 * now 72px, a card that was in a grid cell and is now the whole row. We do not
 * write the destination; the browser does, and Flip measures the difference
 * and plays it backwards.
 *
 * It carries the same three rules as `useGsap` — reduced motion runs nothing,
 * everything reverts, scoped to a ref — plus one of its own.
 *
 * **The fourth rule: capture BEFORE React commits.** Flip needs the layout as
 * it was, and every React effect, `useLayoutEffect` included, runs AFTER the
 * DOM has already changed. By then the "before" is gone. So capturing is not
 * automatic: the caller calls `capture()` in the event handler that is about
 * to change state, and the animation plays itself on the render that follows.
 * This is the whole reason the hook returns two things instead of one.
 *
 * ```js
 * const [scope, capture] = useFlip('[data-flip]');
 *
 * <div ref={scope}>…</div>
 * <button onClick={() => { capture(); setCollapsed((c) => !c); }}>
 * ```
 *
 * `capture` takes no dependency list and watches no state. It records the
 * layout and schedules a render of its own, so whatever the handler does next
 * — one setState, three, or a write to an external store React only hears
 * about through `useSyncExternalStore` — is already committed by the time the
 * layout effect measures again. A hook that instead took `[collapsed]` would
 * have to be told every piece of state that can move the page, and it would
 * be wrong the first time someone added a fourth.
 *
 * It also means `capture` is stable for the life of the component, so it can
 * be handed to another hook without a ref to break the cycle.
 *
 * A capture with nothing changing after it is harmless: Flip measures twice,
 * finds nothing moved, and plays nothing.
 *
 * @param {string} selector  Scoped CSS selector for the elements to follow.
 * @param {gsap.TweenVars} [options]  Merged over the defaults below.
 * @returns {[React.RefObject<HTMLElement>, () => void]} The ref for the
 *   container, and the capture to call before changing anything inside it.
 */
export function useFlip(selector, options = {}) {
  const scope = useRef(null);
  const recorded = useRef(null);
  const reduced = useReducedMotion();

  /*
   * The scheduled render. React batches it with whatever else the handler
   * changed, so this costs one render, not two — and it guarantees a layout
   * effect even when the thing that moved lives outside React's state.
   */
  const [, scheduled] = useReducer((n) => n + 1, 0);

  const capture = useCallback(() => {
    if (reduced || scope.current === null) return;

    recorded.current = Flip.getState(scope.current.querySelectorAll(selector));
    scheduled();
  }, [reduced, selector]);

  /*
   * No dependency array: this must run after EVERY commit, because the commit
   * that moved the page is not always the one this hook could have predicted.
   * It costs a null check on renders where nothing was captured.
   */
  useLayoutEffect(() => {
    if (reduced || recorded.current === null) return undefined;

    /*
     * Cleared before the tween, not after. If the animation throws or the
     * component unmounts mid-flight, a stale state left here would be replayed
     * against a layout it no longer describes, and elements would fly in from
     * wherever they used to be.
     */
    const state = recorded.current;
    recorded.current = null;

    const animation = Flip.from(state, { ...FLIP, ...options });

    return () => animation.kill();
  });

  return [scope, capture];
}

/**
 * Defaults for a layout move.
 *
 * Slower than `MOTION.rise` (300ms) on purpose: a rise tells you something
 * arrived and is over before you look at it, while a Flip is the eye following
 * one thing to a new place. Too fast and it reads as a jump with a smear;
 * these 420ms are the same curve and duration as the `.rise` keyframe in
 * globals.css, so the two vocabularies do not drift apart.
 *
 * `absolute` takes the moving elements out of flow for the duration. Without
 * it, an element that changes a grid's row count drags every sibling's layout
 * with it on each frame, which both looks wrong and costs a reflow per frame.
 */
const FLIP = {
  duration: 0.42,
  ease: 'power2.inOut',
  absolute: true,
};
