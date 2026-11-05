'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { useGsap } from '@/hooks/useGsap';

/**
 * The figure at the foot of the sign-in screen: a volume strip with a trend
 * read across it, drawn once and then still.
 *
 * WHY IT IS DRAWN SMALL AND WIDE. It used to be a six-bar figure in a 480-unit
 * box, stretched across the whole viewport with `slice`. That scales the
 * drawing uniformly, so at 1512px every bar came out 138px wide, the trace
 * came out at a seven-pixel stroke and the point marking "now" came out the
 * size of a thumbnail — a chart blown up until it read as clip-art pasted
 * behind a form. The box is wide now and the drawing is laid out across it at
 * the size it is actually seen at, so a 2.5-unit stroke lands as roughly two
 * and a half pixels, which is what a chart's line is.
 *
 * `meet`, not `slice`. `slice` crops to cover, and what it cropped first was
 * the right-hand end of the trace — the point the whole line is rising
 * towards. `meet` fits the drawing inside the band and anchors it to the
 * bottom, so the figure is whole at every width.
 *
 * There is no number, axis or label anywhere in it. Nobody is signed in, so
 * there is no data to show, and an invented figure on the door of an
 * analytics product would be a lie about the first thing it claims to do.
 * The shapes rise because that is a shape; they do not say by how much.
 *
 * THE MARKUP IS THE FINISHED SCENE. Every element renders where it ends, and
 * the timeline sets the starting state before the first paint. So a reader
 * who asked for less motion gets the finished figure rather than a fast
 * replay, and there is no second code path to keep true: useGsap simply never
 * runs.
 *
 * NO SECOND LOOP. The point that marks "now" used to pulse. The ruled sheet
 * behind the card is the page's one piece of ambient life and it is over in
 * three seconds; a point breathing underneath it for as long as the tab is
 * open would be the one thing on the screen that never settles.
 *
 * The gridlines belong to the sheet behind it (AuthField), not to this: one
 * set of rules carried across the whole screen reads as a single instrument,
 * where two sets read as a chart pasted onto a background.
 *
 * The drawing is left to right in both languages, like every real chart in
 * Baydar.
 */

const SPAN = 1440;
const BASELINE = 196;

/*
 * The volume strip: one tick per slot, rising with the dips a real week has.
 * Shapes, not values — see the note about invented figures above.
 */
const TICK_HEIGHTS = [
  18, 26, 22, 34, 29, 41, 33, 46, 38, 52, 44, 58, 49, 63, 55, 70, 60, 74, 66, 80, 71, 86, 77, 92,
  82, 97, 88, 103, 94, 110, 99, 116, 105, 122, 112, 130,
];

const SLOT = SPAN / TICK_HEIGHTS.length;
const TICK_WIDTH = 12;

const TICKS = TICK_HEIGHTS.map((height, index) => ({
  x: index * SLOT + (SLOT - TICK_WIDTH) / 2,
  height,
}));

/* The trace read across the strip, clear of its tallest tick. */
const TREND = [
  [40, 150],
  [215, 132],
  [390, 141],
  [565, 112],
  [740, 119],
  [915, 86],
  [1090, 95],
  [1265, 54],
  [1400, 34],
];

const LINE = TREND.map(([x, y]) => `${x},${y}`).join(' ');
const NOW = TREND.at(-1);

export function LedgerScene() {
  const { scene } = AUTH_MOTION;

  const root = useGsap((self) => {
    // Scoped by the context, so two auth scenes on one page could never
    // animate each other's elements.
    const q = self.selector;

    gsap
      .timeline({ delay: AUTH_MOTION.sceneStart })
      .from(q('.ledger-col'), {
        scaleY: 0,
        transformOrigin: 'center bottom',
        duration: scene.column,
        stagger: scene.columnStagger,
        ease: 'power2.out',
      })
      /*
       * The line is drawn, not faded. `pathLength="1"` on the element makes
       * the dash length one unit whatever the path's real length, so the
       * offset animates from 1 to 0 without measuring anything.
       */
      .from(
        q('.ledger-line'),
        { strokeDashoffset: 1, duration: scene.line, ease: 'power1.inOut' },
        '-=0.6',
      )
      .from(q('.ledger-dot'), { scale: 0, duration: scene.dot, ease: 'back.out(2)' }, '-=0.1');
  });

  return (
    <svg
      ref={root}
      aria-hidden="true"
      viewBox={`0 0 ${SPAN} 240`}
      dir="ltr"
      preserveAspectRatio="xMidYMax meet"
      className="h-full w-full"
      fill="none"
    >
      {/* The rule every figure stands on. */}
      <line
        x1="0"
        x2={SPAN}
        y1={BASELINE}
        y2={BASELINE}
        stroke="var(--on-brand-line)"
        strokeWidth="1.5"
        opacity="0.5"
      />

      {TICKS.map((tick, index) => (
        <rect
          key={index}
          className="ledger-col"
          x={tick.x}
          y={BASELINE - tick.height}
          width={TICK_WIDTH}
          height={tick.height}
          rx="3"
          fill="var(--on-brand)"
          opacity="0.22"
        />
      ))}

      {/* The line reads the strip, and the point marks now. */}
      <polyline
        className="ledger-line"
        points={LINE}
        pathLength="1"
        strokeDasharray="1"
        stroke="var(--on-brand)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.75"
      />
      <circle className="ledger-dot" cx={NOW[0]} cy={NOW[1]} r="6" fill="var(--accent-on-brand)" />
    </svg>
  );
}
