'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { LedgerScene } from './LedgerScene';
import { useGsap } from '@/hooks/useGsap';

/**
 * The ground the sign-in card stands on: ruled paper, lit from behind.
 *
 * WHAT THIS REPLACED, AND WHY. This layer used to scatter fourteen records
 * across the screen — a dot beside a rounded grey bar, drifting in. Rendered,
 * that is pixel for pixel the skeleton placeholder every product on the web
 * shows while it is still loading, so the first thing the page said to anyone
 * who opened it was "not ready yet". No measurement catches that: contrast
 * passed, nothing scrolled, every target was reachable. It was simply the
 * wrong shape to draw.
 *
 * Rules do not have that problem. A ledger is ruled paper, so the lines are
 * the product's own material rather than a picture of it; and a grid is a
 * flat texture — it has no object in it that could be mistaken for a control
 * or for a thing still loading.
 *
 * MASKED TO AN ELLIPSE, not faded at the edges. A grid that runs to the
 * corners reads as a background image; one that gathers around the centre and
 * dissolves outward reads as light falling on a surface, and it puts the
 * densest part of the texture exactly where the card is — which is where the
 * eye is going anyway.
 *
 * IT ARRIVES AND THEN IT STOPS. There is no `repeat` anywhere in here. An
 * endless loop behind a password field is a screensaver, it keeps a phone's
 * compositor awake for as long as the page is open, and WCAG 2.2.2 asks for a
 * visible pause control once moving content runs past five seconds — a
 * control this screen should not have to carry.
 *
 * Decorative throughout, so the whole layer is `aria-hidden`: the sentence
 * and the form in front of it carry everything a reader needs.
 */

/*
 * The rules, as percentages of the viewport.
 *
 * Horizontals are evenly spaced, like a sheet. Verticals are not: a ledger is
 * ruled into columns of different widths — a wide one for the description,
 * narrow ones for the figures — and evenly spaced verticals would have made
 * graph paper instead, which is a different object with a different meaning.
 *
 * `left`, not `inset-inline-start`: this and the figure at the foot are one
 * drawing, and that drawing runs left to right in both languages like every
 * real chart in the product. Mirrored with the page, the same picture read as
 * two different ones.
 */
const ROWS = Array.from({ length: 13 }, (_, index) => 8 + index * 7);
const COLUMNS = [9, 26, 38, 50, 62, 74, 86, 94];

export function AuthField() {
  const { grid } = AUTH_MOTION;

  const root = useGsap((self) => {
    const q = self.selector;

    /*
     * One timeline, one pass. `from` rather than `to`, so the markup already
     * holds the resting state and a reader who asked for less motion sees the
     * finished field — `useGsap` never runs this callback for them, and there
     * is no second code path to keep true.
     */
    gsap
      .timeline({ delay: AUTH_MOTION.sceneStart })
      .from(q('[data-glow]'), { opacity: 0, duration: grid.glow, ease: 'power1.out' }, 0)
      .from(
        q('[data-rule]'),
        {
          opacity: 0,
          scaleX: 0,
          duration: grid.draw,
          stagger: { each: grid.stagger, from: 'start' },
          ease: 'power2.out',
        },
        0,
      )
      .from(
        q('[data-column]'),
        {
          opacity: 0,
          scaleY: 0,
          duration: grid.draw,
          stagger: { each: grid.stagger, from: 'center' },
          ease: 'power2.out',
        },
        grid.stagger * 4,
      );
  });

  return (
    <div ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {/*
        The light. One soft pool, warm, well above the card's top edge so the
        card is lit rather than haloed — a glow centred on the card would have
        drawn a ring around it, which is the look of a selected element.
      */}
      <div
        data-glow
        className="absolute start-1/2 top-[-28%] h-[85vh] w-[150vw] max-w-[1400px] -translate-x-1/2 bg-[radial-gradient(ellipse_at_center,rgb(224_164_76/0.16)_0%,rgb(224_164_76/0.06)_40%,transparent_70%)] rtl:translate-x-1/2"
      />

      {/*
        The sheet. Masked to an ellipse around the card rather than fading at
        the frame's edges — see the note above.
      */}
      <div className="absolute inset-0 [mask-image:radial-gradient(ellipse_78%_66%_at_50%_44%,#000_0%,rgb(0_0_0/0.55)_55%,transparent_100%)]">
        {ROWS.map((top) => (
          <span
            key={`r${top}`}
            data-rule
            dir="ltr"
            style={{ top: `${top}%`, opacity: grid.rest }}
            className="absolute inset-x-0 block h-px origin-left bg-(--color-on-brand-line)"
          />
        ))}

        {COLUMNS.map((left) => (
          <span
            key={`c${left}`}
            data-column
            // Physical, deliberately — see the note above the rule tables.
            dir="ltr"
            style={{ left: `${left}%`, opacity: grid.rest }}
            className="absolute inset-y-0 block w-px origin-top bg-(--color-on-brand-line)"
          />
        ))}
      </div>

      {/*
        The figure the sheet adds up to, standing on the foot of the screen.

        Faint and thin on purpose. Stretched to the full width it was drawn
        with a seven-pixel stroke and a circle the size of a thumbnail, which
        read as clip-art pasted behind a form; the figure is laid out wide now and
        drawn at the size it is seen at, so its strokes land as strokes.

        It is absolutely positioned, so it never pushes the card anywhere —
        which is exactly why it has to be kept out of the column's way by
        hand. At its first height the trace ran straight through the two
        lines of help text under the card. The band is shallower now and
        dissolves well before its top edge, so the only part of the figure at
        full strength is the part below everything the page has to say.
      */}
      <div className="absolute inset-x-0 bottom-0 h-[26vh] opacity-25 [mask-image:linear-gradient(to_top,#000_0%,rgb(0_0_0/0.45)_42%,transparent_82%)]">
        <LedgerScene />
      </div>
    </div>
  );
}
