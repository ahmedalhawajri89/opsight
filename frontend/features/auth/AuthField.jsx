'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { LedgerScene } from './LedgerScene';
import { useGsap } from '@/hooks/useGsap';

/**
 * The floor, at the size of the screen.
 *
 * WHAT THIS IS FOR. The sign-in page is one field of brand ink with the form
 * standing in the middle of it. This is the field: records falling across the
 * whole width, and the figure they add up to standing on a horizon at the
 * foot. It is the product's own argument at wallpaper scale — which is the
 * only reason a graphic belongs on a login page at all. A stock illustration
 * or a photograph would be the thing every other product does.
 *
 * IT ARRIVES AND THEN IT STOPS. There is no `repeat` anywhere in here. An
 * endless loop behind a password field is a screensaver, it keeps a phone's
 * compositor awake for as long as the page is open, and WCAG 2.2.2 asks for a
 * visible pause control once moving content runs past five seconds — a
 * control this screen should not have to carry. Everything is in place about
 * two and a half seconds after load and then the page is still.
 *
 * A CLEARING IN THE MIDDLE. The form sits over this, so the records are
 * masked away from the centre with a radial fade. Text is never read over
 * moving texture; that mistake was made once already on the old panel, where
 * a record ran straight through the wordmark.
 *
 * HTML for the records, SVG for the figure. The records are a dot and a
 * rounded bar repeated, which a percentage-positioned span does exactly; an
 * SVG stretched from a 360px phone to a 1920px desk would crop or distort
 * them. The figure is a drawing with a traced line, which is SVG's job.
 *
 * Decorative throughout, so the whole layer is `aria-hidden`: the sentence
 * and the form in front of it carry everything a reader needs.
 */

/*
 * The records, as percentages of the viewport.
 *
 * Spread across the full width and down the upper two thirds, thinning as
 * they approach the horizon. `left`, not `inset-inline-start`: this and the
 * figure below are one drawing, and that drawing runs left to right in both
 * languages like every real chart in the product. Mirrored with the page, the
 * same picture read as two different ones.
 */
const RECORDS = [
  { top: 6, left: 4, width: 17, kind: 'ink' },
  { top: 10, left: 70, width: 20, kind: 'accent' },
  { top: 15, left: 24, width: 14, kind: 'ink' },
  { top: 19, left: 51, width: 12, kind: 'muted' },
  { top: 23, left: 2, width: 19, kind: 'ink' },
  { top: 28, left: 79, width: 16, kind: 'ink' },
  { top: 33, left: 30, width: 11, kind: 'accent' },
  { top: 38, left: 62, width: 18, kind: 'ink' },
  { top: 44, left: 5, width: 15, kind: 'muted' },
  { top: 50, left: 84, width: 13, kind: 'ink' },
  { top: 56, left: 12, width: 17, kind: 'ink' },
  { top: 62, left: 72, width: 14, kind: 'accent' },
  { top: 68, left: 25, width: 12, kind: 'ink' },
  { top: 74, left: 88, width: 10, kind: 'muted' },
];

/* Three values of light, not three hues. The chart palette is tuned for a
 * white ground and goes muddy on ink; these are already contrast-checked
 * against the panel (tests/contrast.test.js). */
const DOT = {
  ink: 'bg-(--color-on-brand)',
  muted: 'bg-(--color-on-brand-2)',
  accent: 'bg-(--color-accent-on-brand)',
};

export function AuthField() {
  const { stream } = AUTH_MOTION;

  const root = useGsap((self) => {
    /*
     * One timeline, one pass. `from` rather than `to`, so the markup already
     * holds the resting state and a reader who asked for less motion sees the
     * finished field — `useGsap` never runs this callback for them, and there
     * is no second code path to keep true.
     */
    gsap.timeline({ delay: AUTH_MOTION.sceneStart }).from(self.selector('[data-record]'), {
      opacity: 0,
      y: -stream.travel,
      duration: stream.cycle,
      stagger: { each: stream.gap, from: 'start' },
      ease: 'power2.out',
    });
  });

  return (
    <div ref={root} aria-hidden="true" className="pointer-events-none absolute inset-0 z-0">
      {/*
        The records. On a phone too: this layer is absolutely positioned and
        costs no height, so hiding it there bought nothing and left the one
        screen with the least character as a form on a dark rectangle. The
        clearing behind the form is widened instead, because at 390px the
        form is most of the width and needs more of it kept clear.
      */}
      <div className="absolute inset-0">
        {RECORDS.map((record) => (
          <span
            key={`${record.top}-${record.left}`}
            data-record
            // Physical, deliberately — see the note above the record table.
            dir="ltr"
            style={{
              top: `${record.top}%`,
              left: `${record.left}%`,
              width: `${record.width}%`,
              opacity: stream.rest,
            }}
            className="absolute flex items-center gap-2"
          >
            <span className={`size-1.5 shrink-0 rounded-(--radius-pill) ${DOT[record.kind]}`} />
            <span className="h-1.5 w-full rounded-(--radius-pill) bg-(--color-on-brand)/25" />
          </span>
        ))}
      </div>

      {/*
        The horizon: the figure the records add up to, standing on the foot of
        the screen.

        Sized in `vh` and faint. Left to its own width it drew a chart 730px
        tall across a 900px screen with its trace running straight through the
        email field — a graphic competing with the one thing the page is for.

        It stays at every size: it is absolutely positioned, so it never
        pushes the form anywhere, and the clearing above it is what keeps it
        off the fields.
      */}
      <div className="absolute inset-x-0 bottom-0 h-[38vh] opacity-40">
        <LedgerScene fill />
      </div>

      {/*
        The clearing, and it has to come LAST.

        A radial wash of the panel’s own ink over the middle, so everything
        behind the form fades out instead of being read through it. Painted
        before the figure it masked only the records, and the figure’s trace
        ran across the fields regardless.
      */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_46%_at_50%_50%,var(--brand-panel)_42%,transparent_82%)] sm:bg-[radial-gradient(ellipse_44%_48%_at_50%_50%,var(--brand-panel)_40%,transparent_80%)]" />
    </div>
  );
}
