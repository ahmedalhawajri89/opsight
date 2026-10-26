'use client';

import { useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * The one place GSAP is allowed to touch the page.
 *
 * THREE RULES, and they are the reason this exists rather than calling gsap
 * from each component.
 *
 * 1. **A reader who asked for less motion gets none.** The preference is read
 *    through the same hook the charts use, and when it is set the callback is
 *    never run at all — so the markup renders in its final state rather than
 *    animating to it quickly. CSS honours the preference through a media query
 *    in globals.css; GSAP writes inline styles and never sees that query, so
 *    it has to be checked here.
 *
 * 2. **Everything is reverted on unmount.** `gsap.context()` records every
 *    tween and inline style it creates, and `revert()` puts the DOM back as it
 *    was. Without it an animated element keeps the inline `transform` and
 *    `opacity` GSAP left on it, and in React — where the same node is reused
 *    across renders — that shows up as an element stuck invisible.
 *
 * 3. **Scoped to a ref, never to a global selector.** Two dashboards on one
 *    page would otherwise animate each other's cards.
 *
 * Returns the ref to put on the container. Anything animated inside is
 * selected with `gsap.utils.selector(scope)` or a plain class string, which
 * the context scopes automatically.
 *
 * @param {(self: gsap.Context) => void} build  Defines the animation.
 * @param {ReadonlyArray<unknown>} deps  Re-runs the animation when these change.
 */
export function useGsap(build, deps = []) {
  const scope = useRef(null);
  const reduced = useReducedMotion();

  /*
   * useLayoutEffect, not useEffect: the first frame must already carry the
   * animation's starting state. With useEffect the browser paints the final
   * layout first and the animation then yanks it back, which reads as a flash.
   * React warns about useLayoutEffect on the server; this only ever runs in
   * the browser because the component is a client component and the effect
   * does not run during SSR.
   */
  useLayoutEffect(() => {
    if (reduced) return undefined;

    const context = gsap.context(build, scope);

    return () => context.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, ...deps]);

  return scope;
}

/**
 * The house motion vocabulary, so timings are a decision taken once.
 *
 * A dashboard is read, not watched. These are deliberately at the subtle end:
 * a card rises eight pixels, not forty, and a list staggers by thirty
 * milliseconds, not two hundred. Motion here says "this is new" and "these
 * belong together", and nothing else.
 */
export const MOTION = {
  /** A card or panel arriving. */
  rise: { opacity: 0, y: 8, duration: 0.3, ease: 'power1.out' },

  /** Items that belong to one group, revealed in order. */
  stagger: 0.03,

  /**
   * Hover lift. Applied with quickTo rather than a fresh tween per event:
   * a table of twenty hoverable rows would otherwise build and discard a
   * tween on every mouse move.
   */
  hover: { y: -2, duration: 0.2, ease: 'power2.out' },
};
