'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { useGsap } from '@/hooks/useGsap';

/**
 * The records, still arriving, behind everything else on the panel.
 *
 * WHAT IT REPLACED. The panel used to be three stacked blocks — mark,
 * sentence, figure — with a void between each pair: about 120px under the
 * logo and 240px under the tagline, on a screen 980px tall. The thesis lived
 * entirely inside a three-second animation at the foot, so a visitor who
 * reloaded, or who looked up a moment late, met a bar chart. Every analytics
 * product has one of those.
 *
 * Now the claim is legible standing still. Records drift down the upper half
 * of the panel and dissolve; the sentence that explains them sits in the
 * middle; the figure they became stands below it. Nobody has to catch a
 * three-second show to read the argument — the show only makes it move.
 *
 * HTML, NOT SVG. These are a dot and a rounded bar, and an SVG sized to cover
 * a panel whose aspect ratio runs from about 0.75 to 1.1 must either crop
 * (`slice`, which eats the edges) or distort (`none`, which turns a rounded
 * corner into an ellipse). Absolutely positioned elements at percentage
 * offsets do neither, and `inset-inline-start` mirrors itself in Arabic for
 * free.
 *
 * ONLY THIS LOOPS. The figure below is drawn once and then rests, because it
 * IS the standing answer; records are what keep coming. A panel where
 * everything cycled forever would be a screensaver behind a password field.
 *
 * The records start about 3% in, which is where the figure's own baseline
 * starts — so the stream and the drawing below it share a left margin and
 * read as one object rather than two things that happen to be stacked.
 *
 * Decorative, so `aria-hidden`: the sentence beside it already carries the
 * meaning, and the figure below it has its own label.
 */

/*
 * The field, as percentages of the panel.
 *
 * WHY HERE AND NOWHERE ELSE. The first attempt put the stream across the top
 * 40%, which is where the mark and the sentence live: a record ran straight
 * through the word "Baydar" and another through the tagline. Faintness is
 * not a licence to lay texture over type.
 *
 * So the band is the gap the panel actually had — between the tagline and
 * the top of the figure — and the records drift down out of it into the
 * columns. That is the one place on the panel where they are both out of the
 * way and saying something: a record dissolving as the figure begins is the
 * product's whole claim, drawn where the eye already travels.
 *
 * `left`, NOT `inset-inline-start` — the codebase's second deliberate use of
 * a physical side, after the password reveal button. The stream and the
 * figure below it are one drawing, and that drawing is left to right in both
 * languages, like every real chart in Baydar. Mirrored with the page, the
 * records landed on the figure's tallest columns in Arabic and its shortest
 * in English: the same picture reading as two different ones. Pinned left,
 * the records always dissolve over the low end of the figure, which is where
 * a record becoming a column makes sense.
 */
const RECORDS = [
  { top: 43, start: 3, width: 32, kind: 'on-brand' },
  { top: 48, start: 13, width: 24, kind: 'accent-on-brand' },
  { top: 53, start: 5, width: 36, kind: 'on-brand' },
  { top: 58, start: 19, width: 20, kind: 'on-brand-2' },
  { top: 63, start: 8, width: 28, kind: 'on-brand' },
  { top: 68, start: 15, width: 23, kind: 'accent-on-brand' },
];

/* A record's kind decides its dot. Three values of light, not three hues —
 * the chart palette is tuned for a white ground and goes muddy on ink. */
const DOT = {
  'on-brand': 'bg-(--color-on-brand)',
  'on-brand-2': 'bg-(--color-on-brand-2)',
  'accent-on-brand': 'bg-(--color-accent-on-brand)',
};

export function RecordStream() {
  const { stream } = AUTH_MOTION;

  const root = useGsap((self) => {
    /*
     * One tween per record rather than one staggered tween over all of them.
     * A stagger would restart the whole group together on every repeat, which
     * reads as a pulse; separate tweens with their own delays never line up
     * again, so the stream has no seam.
     *
     * Percentage keyframes, so a record fades in, holds, and fades out within
     * a single tween — and its resting state in the markup is the state it
     * holds for most of its life. A reader who asked for less motion gets a
     * still field of records rather than a blank panel (useGsap never runs the
     * callback at all, so there is no second code path to keep true).
     */
    self.selector('[data-record]').forEach((record, index) => {
      gsap.to(record, {
        keyframes: {
          '0%': { opacity: 0, y: -stream.travel },
          '20%': { opacity: stream.rest },
          '68%': { opacity: stream.rest },
          '100%': { opacity: 0, y: stream.travel },
        },
        duration: stream.cycle,
        ease: 'none',
        repeat: -1,
        delay: index * stream.gap,
      });
    });
  });

  /*
   * Desktop only. Below lg the panel is a band above the form, roughly 390px
   * tall and already full of the headline; a drifting field in there is
   * texture nobody asked for on the screen with the least room.
   */
  return (
    <div
      ref={root}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 hidden lg:block"
    >
      {RECORDS.map((record) => (
        <span
          key={record.top}
          data-record
          // Same reason as `left`: the dot leads the bar in both languages,
          // because this is one drawing with the figure, not a line of text.
          dir="ltr"
          style={{
            top: `${record.top}%`,
            // Physical, deliberately — see the note above the record table.
            left: `${record.start}%`,
            width: `${record.width}%`,
            opacity: AUTH_MOTION.stream.rest,
          }}
          className="absolute flex items-center gap-3"
        >
          {/*
            Faint enough to be texture rather than content. The dot keeps its
            kind's colour at full strength because it is two pixels across and
            the three kinds have to stay distinguishable; the bar beside it
            carries the weight, so it is the part that recedes.
          */}
          <span className={`size-2 shrink-0 rounded-(--radius-pill) ${DOT[record.kind]}`} />
          <span className="h-2 w-full rounded-(--radius-pill) bg-(--color-on-brand)/20" />
        </span>
      ))}
    </div>
  );
}
