'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useGsap } from '@/hooks/useGsap';

/**
 * The sign-in page's one piece of motion: records becoming a figure.
 *
 * It is the product's thesis drawn in three beats. Ledger rows arrive — an
 * order, an expense, a stock movement, each marked by the colour of its kind —
 * then fold away as a single figure rises in their place, and a line traces
 * across it to a bronze point that marks "now". The individual colours do not
 * survive into the figure; once a record has been computed into it, what it
 * was stops mattering.
 *
 * There is no number, axis or label anywhere in it. Nobody is signed in, so
 * there is no data to show, and an invented figure on the door of an
 * analytics product would be a lie about the first thing it claims to do.
 *
 * THE MARKUP IS THE FINISHED SCENE. Every element renders where it ends —
 * the figure drawn, the rows already folded away — and the timeline sets the
 * starting state before the first paint. So a reader who asked for less
 * motion gets the finished figure rather than a fast replay, and there is no
 * second code path to keep true: useGsap simply never runs.
 *
 * It is a timeline rather than keyframes because the captions name the beats.
 * Each one lights as the drawing reaches the thing it describes, and a
 * timeline is what keeps that true when a duration changes; the delays it
 * replaced lived in two files and agreed only by hand.
 *
 * The drawing is left to right in both languages, like every real chart in
 * Opsight.
 */

/*
 * A record's kind decides its chip colour. Six rows, three kinds.
 *
 * Three VALUES of light rather than three saturated hues: the chart palette
 * is tuned for a white ground and goes muddy on ink, and three bright dots
 * on a dark panel read as a toy. These three are already contrast-checked
 * against the panel (tests/contrast.test.js), and the claim the scene makes
 * — records of different kinds becoming one figure — needs them to be
 * distinguishable, not colourful.
 */
const ROWS = [
  { kind: 'on-brand', width: 196 },
  { kind: 'accent-on-brand', width: 148 },
  { kind: 'on-brand', width: 172 },
  { kind: 'on-brand-2', width: 124 },
  { kind: 'on-brand', width: 184 },
  { kind: 'accent-on-brand', width: 136 },
];

/* The figure's columns: shapes, not values. Rising, with one honest dip. */
const BASELINE = 196;
const COLUMN_WIDTH = 36;
const COLUMNS = [52, 66, 58, 84, 78, 110].map((height, index) => ({
  x: 58 + index * 66,
  height,
}));

const LINE = COLUMNS.map(
  ({ x, height }) => `${x + COLUMN_WIDTH / 2},${BASELINE - height - 12}`,
).join(' ');

const NOW = COLUMNS.at(-1);
const NOW_X = NOW.x + COLUMN_WIDTH / 2;
const NOW_Y = BASELINE - NOW.height - 12;

/* Each caption lights at the beat it names — see the timeline's labels. */
const STEPS = [
  { key: 'records', at: 'records' },
  { key: 'computed', at: 'computed' },
  { key: 'figure', at: 'figure' },
];

export function LedgerScene() {
  const { t } = useI18n();
  const { scene } = AUTH_MOTION;

  const root = useGsap((self) => {
    // Scoped by the context, so two auth scenes on one page could never
    // animate each other's elements.
    const q = self.selector;

    const timeline = gsap.timeline({ delay: AUTH_MOTION.sceneStart });

    timeline
      .addLabel('records')
      /*
       * fromTo, not from: the rows' resting state is GONE — they have folded
       * away by the end — so there is no natural state to animate from. A
       * `from` here would leave them lying over the finished figure for any
       * reader whose motion preference skips the timeline.
       *
       * `x` in SVG user units, not xPercent: these are drawing coordinates,
       * not a box to be measured.
       */
      .fromTo(
        q('.ledger-row'),
        { opacity: 0, x: -14 },
        {
          opacity: 1,
          x: 0,
          duration: scene.rowIn,
          stagger: scene.rowStagger,
          ease: 'power2.out',
        },
      )

      .addLabel('computed')
      // They fold away as the figure takes their place: both beats run
      // together, because that overlap IS the claim being made.
      .to(q('.ledger-row'), {
        opacity: 0,
        x: 10,
        duration: scene.rowOut,
        stagger: scene.rowStagger / 2,
        ease: 'power2.in',
      })
      .from(
        q('.ledger-col'),
        {
          scaleY: 0,
          transformOrigin: 'center bottom',
          duration: scene.column,
          stagger: scene.columnStagger,
          ease: 'power2.out',
        },
        '<0.1',
      )

      .addLabel('figure')
      /*
       * The line is drawn, not faded. `pathLength="1"` on the element makes
       * the dash length one unit whatever the path's real length, so the
       * offset animates from 1 to 0 without measuring anything.
       */
      .from(q('.ledger-line'), {
        strokeDashoffset: 1,
        duration: scene.line,
        ease: 'power1.inOut',
      })
      .from(q('.ledger-dot'), { scale: 0, duration: scene.dot, ease: 'back.out(2)' }, '-=0.1');

    /*
     * Each caption brightens at the beat it NAMES — one tween per caption,
     * positioned by that beat's label. A single tween over the shared class
     * would light all three at once, three times over, which looks like a
     * flicker and says nothing.
     *
     * Positioned by label, so changing any duration above carries the
     * captions with it. That is the whole reason this is a timeline rather
     * than the list of hand-written delays it replaced.
     */
    q('.ledger-step').forEach((step, index) => {
      timeline.from(step, { opacity: 0.4, duration: 0.3 }, STEPS[index].at);
    });

    // The point that marks "now", breathing. A long gap between beats: this
    // sits behind a form someone is typing into.
    gsap.to('.ledger-ring', {
      scale: 1.9,
      opacity: 0,
      duration: scene.pulse,
      ease: 'power2.out',
      repeat: -1,
      repeatDelay: scene.pulseGap,
      delay: AUTH_MOTION.sceneStart + 2.4,
      transformOrigin: 'center center',
    });
  });

  return (
    <figure className="mt-12" ref={root}>
      <svg
        role="img"
        aria-label={t('login.scene.label')}
        viewBox="0 0 480 220"
        dir="ltr"
        className="h-auto w-full"
        fill="none"
      >
        {/*
          The rules a figure is read against — the same dashed gridlines the
          real charts use, so the door is drawn in the product's own hand.
          Faint enough to sit behind everything: a frame of reference, not
          content.
        */}
        {[0.28, 0.52, 0.76].map((fraction) => (
          <line
            key={fraction}
            x1="36"
            x2="444"
            y1={BASELINE - BASELINE * fraction}
            y2={BASELINE - BASELINE * fraction}
            stroke="var(--on-brand-line)"
            strokeWidth="1"
            strokeDasharray="3 6"
            opacity="0.3"
          />
        ))}

        {/* The rule every figure stands on. */}
        <line
          x1="36"
          x2="444"
          y1={BASELINE}
          y2={BASELINE}
          stroke="var(--on-brand-line)"
          strokeWidth="2"
          opacity="0.7"
        />

        {/* 1 — records arrive. */}
        {ROWS.map((row, index) => (
          /*
            Hidden at rest: by the end of the scene these have folded away,
            and the markup renders the end. The timeline brings them in and
            takes them out again.
          */
          <g key={index} className="ledger-row" opacity="0">
            <circle cx="46" cy={28 + index * 24} r="5" fill={`var(--${row.kind})`} />
            <rect
              x="60"
              y={23 + index * 24}
              width={row.width}
              height="10"
              rx="5"
              fill="var(--on-brand)"
              opacity="0.18"
            />
          </g>
        ))}

        {/* 2 — a figure rises where they were. */}
        {COLUMNS.map((column, index) => (
          <rect
            key={index}
            className="ledger-col"
            x={column.x}
            y={BASELINE - column.height}
            width={COLUMN_WIDTH}
            height={column.height}
            rx="6"
            fill="var(--on-brand)"
            opacity="0.26"
          />
        ))}

        {/* 3 — the line reads it, and the point marks now. */}
        <polyline
          className="ledger-line"
          points={LINE}
          pathLength="1"
          strokeDasharray="1"
          stroke="var(--on-brand)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          className="ledger-ring"
          cx={NOW_X}
          cy={NOW_Y}
          r="7"
          stroke="var(--accent-on-brand)"
          strokeWidth="2"
          /*
           * Invisible until the pulse drives it. It is the one element whose
           * resting state is not its finished state — a ring frozen mid-pulse
           * would read as a bug — so a reader with reduced motion sees the
           * bronze point alone, which is the scene's end anyway.
           */
          opacity="0"
        />
        <circle
          className="ledger-dot"
          cx={NOW_X}
          cy={NOW_Y}
          r="5.5"
          fill="var(--accent-on-brand)"
        />
      </svg>

      {/* The three beats, named — lit in turn as the drawing reaches each one. */}
      <figcaption className="mt-7 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-(--color-on-brand-line)/25 pt-5 text-sm text-(--color-on-brand-2)">
        {STEPS.map((step, index) => (
          <span key={step.key} className="inline-flex items-center gap-3">
            {index > 0 && (
              <span aria-hidden="true" className="h-px w-6 bg-(--color-on-brand-line)/40" />
            )}
            <span className="ledger-step inline-flex items-center gap-2">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-(--radius-pill) bg-(--color-accent-on-brand)"
              />
              {t(`login.scene.${step.key}`)}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
