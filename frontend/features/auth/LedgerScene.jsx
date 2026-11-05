'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useGsap } from '@/hooks/useGsap';

/**
 * The figure the records became.
 *
 * It used to tell the whole three-beat story by itself — rows arriving, rows
 * folding, a figure rising in their place — which meant the story existed
 * only while the animation ran. The records now live above it and keep
 * arriving (RecordStream), so what is left here is the thing they add up to,
 * and this draws once and then rests. That division is the claim: records are
 * what keep coming, the figure is the standing answer.
 *
 * There is no number, axis or label anywhere in it. Nobody is signed in, so
 * there is no data to show, and an invented figure on the door of an
 * analytics product would be a lie about the first thing it claims to do.
 *
 * THE MARKUP IS THE FINISHED SCENE. Every element renders where it ends, and
 * the timeline sets the starting state before the first paint. So a reader
 * who asked for less motion gets the finished figure rather than a fast
 * replay, and there is no second code path to keep true: useGsap simply never
 * runs.
 *
 * It is a timeline rather than keyframes because the captions name the beats.
 * Each one lights as the drawing reaches the thing it describes, and a
 * timeline is what keeps that true when a duration changes.
 *
 * The gridlines belong to the field behind it now, not to this: one set of
 * rules carried the whole height of the panel reads as a single instrument,
 * where two sets read as a chart pasted onto a background.
 *
 * The drawing is left to right in both languages, like every real chart in
 * Baydar.
 */

/*
 * The figure's columns: shapes, not values. Rising, with one honest dip.
 *
 * Taller against its baseline than the drawing this replaced, and in a taller
 * box. The panel distributes its three blocks with `justify-between`, so the
 * height of this one decides how much air is left above it — the old figure
 * reached barely half its baseline and left a 240px void under the tagline.
 */
const BASELINE = 230;
const COLUMN_WIDTH = 44;
const COLUMNS = [70, 96, 82, 128, 112, 170].map((height, index) => ({
  x: 40 + index * 70,
  height,
}));

const LINE = COLUMNS.map(
  ({ x, height }) => `${x + COLUMN_WIDTH / 2},${BASELINE - height - 14}`,
).join(' ');

const NOW = COLUMNS.at(-1);
const NOW_X = NOW.x + COLUMN_WIDTH / 2;
const NOW_Y = BASELINE - NOW.height - 14;

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
      /*
       * The records are already on the panel and already moving when this
       * starts, so the first beat has nothing of its own to animate — it is a
       * label the caption hangs on, naming what the reader can see above.
       */
      .addLabel('records')

      .addLabel('computed')
      .from(q('.ledger-col'), {
        scaleY: 0,
        transformOrigin: 'center bottom',
        duration: scene.column,
        stagger: scene.columnStagger,
        ease: 'power2.out',
      })

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
     */
    q('.ledger-step').forEach((step, index) => {
      timeline.from(step, { opacity: 0.4, duration: 0.3 }, STEPS[index].at);
    });

    // The point that marks "now", breathing. A long gap between beats: this
    // sits behind a form someone is typing into.
    gsap.to(q('.ledger-ring'), {
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
    <figure ref={root}>
      <svg
        role="img"
        aria-label={t('login.scene.label')}
        viewBox="0 0 480 244"
        dir="ltr"
        className="h-auto w-full"
        fill="none"
      >
        {/*
          The rules a figure is read against — the same dashed gridlines the
          real charts use, so the door is drawn in the product's own hand.
          They belong to the figure and scale with it: carried across the
          whole panel instead, one of them ruled a line through the middle of
          the headline.
        */}
        {[0.3, 0.55, 0.8].map((fraction) => (
          <line
            key={fraction}
            x1="20"
            x2="460"
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
          x1="20"
          x2="460"
          y1={BASELINE}
          y2={BASELINE}
          stroke="var(--on-brand-line)"
          strokeWidth="2"
          opacity="0.7"
        />

        {COLUMNS.map((column, index) => (
          <rect
            key={index}
            className="ledger-col"
            x={column.x}
            y={BASELINE - column.height}
            width={COLUMN_WIDTH}
            height={column.height}
            rx="7"
            fill="var(--on-brand)"
            opacity="0.26"
          />
        ))}

        {/* The line reads it, and the point marks now. */}
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
