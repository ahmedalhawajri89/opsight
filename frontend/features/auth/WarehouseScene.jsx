'use client';

import { gsap } from 'gsap';

import { AUTH_MOTION } from './authMotion';
import { useGsap } from '@/hooks/useGsap';

/**
 * The picture on the ink panel: a rack of stock, and the screen that counts it.
 *
 * WHY A DRAWING AND NOT A PHOTOGRAPH. A photograph of a warehouse worker is
 * what every inventory product puts here, it weighs more than the rest of the
 * page together, and it can only show a place. A drawing can show the
 * product's argument — boxes on a shelf on one side, the figures they add up
 * to on the other — in the brand's two colours, at any size, for a few hundred
 * bytes.
 *
 * THE MARKUP IS THE FINISHED PICTURE. Every element is written in its final
 * state and the timeline animates FROM a start state, so a reader who asked
 * for less motion (useGsap never runs) and a browser that never runs the
 * script both see the complete scene with no second code path.
 *
 * IT ARRIVES AND THEN IT STOPS. Nothing repeats: an endless loop behind a
 * password field keeps a phone's compositor awake and WCAG 2.2.2 would then
 * ask for a pause control. The one thing that moves afterwards is the depth
 * of the layers following a fine pointer, which only ever answers the reader
 * and is still when they are.
 *
 * Lines are drawn with `pathLength="1"`, so a stroke's dash is 1 whatever its
 * real length and "undrawn" is simply an offset of 1.
 *
 * Decorative throughout, so the whole drawing is `aria-hidden`.
 */

/* Boxes on the three shelves, as [x, width, height]; each sits on its beam. */
const SHELVES = [
  {
    floor: 150,
    boxes: [
      [72, 58, 54],
      [138, 44, 38],
      [190, 70, 62],
      [268, 48, 34],
    ],
  },
  {
    floor: 250,
    boxes: [
      [76, 70, 64],
      [154, 54, 48],
      [216, 40, 30],
    ],
  },
  {
    floor: 350,
    boxes: [
      [72, 54, 44],
      [134, 80, 70],
      [222, 34, 30],
    ],
  },
];

/* The tablet's bar chart: heights out of the 96 units available. The last is now. */
const BARS = [38, 56, 32, 68, 50, 84];

/* The tablet's trend line, in the tablet's own coordinates. */
const TREND = '18,80 40,71 62,75 84,58 106,63 128,47 150,41';

/* Share of the ring that is filled: stock in hand against capacity. */
const DONUT_FILL = 72;

export function WarehouseScene({ className }) {
  const root = useGsap((self) => {
    const q = self.selector;
    const tl = gsap.timeline({ delay: AUTH_MOTION.sceneStart, defaults: { ease: 'power3.out' } });

    tl.from(q('[data-scene-glow]'), {
      opacity: 0,
      scale: 0.7,
      duration: 1.2,
      transformOrigin: '50% 50%',
    })
      .from(
        q('[data-scene-rack]'),
        { strokeDashoffset: 1, duration: 0.7, stagger: 0.06, ease: 'power2.inOut' },
        0,
      )
      .from(
        q('[data-scene-box]'),
        { y: -46, opacity: 0, duration: 0.7, stagger: 0.05, ease: 'bounce.out' },
        0.35,
      )
      .from(
        q('[data-scene-tablet]'),
        { y: 34, opacity: 0, scale: 0.94, duration: 0.8, transformOrigin: '50% 100%' },
        0.55,
      )
      .from(
        q('[data-scene-bar]'),
        {
          scaleY: 0,
          duration: 0.6,
          stagger: 0.07,
          transformOrigin: '50% 100%',
          ease: 'back.out(1.6)',
        },
        '-=0.35',
      )
      .from(
        q('[data-scene-trend]'),
        { strokeDashoffset: 1, duration: 0.9, ease: 'power2.inOut' },
        '<0.1',
      )
      .from(
        q('[data-scene-donut]'),
        { strokeDasharray: `0 100`, duration: 1.1, ease: 'power2.out' },
        '<',
      )
      .from(
        q('[data-scene-now]'),
        { scale: 0, duration: 0.5, transformOrigin: '50% 50%', ease: 'back.out(3)' },
        '-=0.4',
      )
      /* One sweep of a scanner across the rack, then the light is gone. */
      .fromTo(
        q('[data-scene-scan]'),
        { x: 0, opacity: 0 },
        { x: 250, opacity: 1, duration: 1.3, ease: 'sine.inOut' },
        '-=0.6',
      )
      .to(q('[data-scene-scan]'), { opacity: 0, duration: 0.35 }, '-=0.35');

    /*
     * Depth. Each layer carries how far it may travel; quickTo reuses one
     * tween per axis instead of building one on every mouse move. Only for a
     * fine pointer — on touch there is no hover to follow.
     */
    const svg = self.selector('svg')[0];
    const host = svg?.closest('[data-auth-hero]');

    if (!host || !window.matchMedia('(pointer: fine)').matches) return undefined;

    const layers = q('[data-depth]').map((node) => ({
      depth: Number(node.dataset.depth),
      x: gsap.quickTo(node, 'x', { duration: 0.8, ease: 'power3.out' }),
      y: gsap.quickTo(node, 'y', { duration: 0.8, ease: 'power3.out' }),
    }));

    function follow(event) {
      const box = host.getBoundingClientRect();
      const dx = (event.clientX - box.left) / box.width - 0.5;
      const dy = (event.clientY - box.top) / box.height - 0.5;

      for (const layer of layers) {
        layer.x(dx * layer.depth);
        layer.y(dy * layer.depth);
      }
    }

    function settle() {
      for (const layer of layers) {
        layer.x(0);
        layer.y(0);
      }
    }

    host.addEventListener('pointermove', follow);
    host.addEventListener('pointerleave', settle);

    return () => {
      host.removeEventListener('pointermove', follow);
      host.removeEventListener('pointerleave', settle);
    };
  });

  return (
    <div ref={root} className={className} aria-hidden="true">
      <svg
        viewBox="0 0 560 400"
        className="h-full w-full"
        preserveAspectRatio="xMidYMax meet"
        focusable="false"
      >
        <defs>
          <radialGradient id="scene-glow">
            <stop
              offset="0"
              style={{ stopColor: 'var(--color-accent-on-brand)', stopOpacity: 0.28 }}
            />
            <stop
              offset="1"
              style={{ stopColor: 'var(--color-accent-on-brand)', stopOpacity: 0 }}
            />
          </radialGradient>
          <linearGradient id="scene-scan" x1="0" x2="1" y1="0" y2="0">
            <stop
              offset="0"
              style={{ stopColor: 'var(--color-accent-on-brand)', stopOpacity: 0 }}
            />
            <stop
              offset="0.5"
              style={{ stopColor: 'var(--color-accent-on-brand)', stopOpacity: 0.35 }}
            />
            <stop
              offset="1"
              style={{ stopColor: 'var(--color-accent-on-brand)', stopOpacity: 0 }}
            />
          </linearGradient>
        </defs>

        <circle data-scene-glow cx="390" cy="250" r="190" fill="url(#scene-glow)" />

        {/* The floor. */}
        <path
          d="M20 360.5h520"
          pathLength="1"
          strokeDasharray="1"
          data-scene-rack
          className="stroke-(--color-on-brand-line)/40"
          strokeWidth="1.5"
        />

        {/* The rack, furthest back. */}
        <g data-depth="10">
          <g
            className="stroke-(--color-on-brand-line)/70"
            strokeWidth="3"
            strokeLinecap="round"
            fill="none"
          >
            {[
              'M60 56v304',
              'M330 56v304',
              'M60 150h270',
              'M60 250h270',
              'M60 350h270',
              'M195 56v6',
            ].map((d) => (
              <path key={d} d={d} pathLength="1" strokeDasharray="1" data-scene-rack />
            ))}
          </g>

          {SHELVES.map(({ floor, boxes }) =>
            boxes.map(([x, w, h], index) => (
              <g key={`${floor}-${x}`} data-scene-box>
                <rect
                  x={x}
                  y={floor - h - 1.5}
                  width={w}
                  height={h}
                  rx="3"
                  className={
                    index % 2 === 0
                      ? 'fill-(--color-accent-on-brand)'
                      : 'fill-(--color-accent-on-brand)/65'
                  }
                />
                {/* Packing tape, and the label every carton carries. */}
                <path
                  d={`M${x + w / 2} ${floor - h - 1.5}v${h * 0.32}`}
                  className="stroke-(--color-brand-panel)/35"
                  strokeWidth="3"
                />
                <rect
                  x={x + 6}
                  y={floor - 14}
                  width={Math.min(18, w / 3)}
                  height="7"
                  rx="1.5"
                  className="fill-(--color-brand-panel)/25"
                />
              </g>
            )),
          )}

          <rect
            data-scene-scan
            x="60"
            y="56"
            width="26"
            height="304"
            fill="url(#scene-scan)"
            opacity="0"
          />
        </g>

        {/* The screen that counts it, nearest. */}
        <g data-depth="22">
          <g transform="translate(262 168)">
            <g data-scene-tablet>
              <rect
                width="270"
                height="182"
                rx="16"
                className="fill-(--color-on-brand-raise) stroke-(--color-on-brand-line)/45"
                strokeWidth="1.5"
              />
              <rect
                x="8"
                y="8"
                width="254"
                height="166"
                rx="10"
                className="fill-(--color-brand-panel-deep)/70"
              />

              {[20, 32, 44].map((cx) => (
                <circle
                  key={cx}
                  cx={cx}
                  cy="22"
                  r="3"
                  className="fill-(--color-on-brand-line)/60"
                />
              ))}

              <polyline
                data-scene-trend
                points={TREND}
                pathLength="1"
                strokeDasharray="1"
                fill="none"
                className="stroke-(--color-accent-on-brand)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <g data-scene-now>
                <circle cx="150" cy="41" r="8" className="fill-(--color-accent-on-brand)/25" />
                <circle cx="150" cy="41" r="3.5" className="fill-(--color-accent-on-brand)" />
              </g>

              {BARS.map((h, index) => (
                <rect
                  key={index}
                  data-scene-bar
                  x={20 + index * 22}
                  y={164 - h * 0.62}
                  width="13"
                  height={h * 0.62}
                  rx="3"
                  className={
                    index === BARS.length - 1
                      ? 'fill-(--color-accent-on-brand)'
                      : 'fill-(--color-on-brand-line)/55'
                  }
                />
              ))}

              <g transform="rotate(-90 214 108)">
                <circle
                  cx="214"
                  cy="108"
                  r="34"
                  fill="none"
                  className="stroke-(--color-on-brand-line)/25"
                  strokeWidth="12"
                />
                <circle
                  data-scene-donut
                  cx="214"
                  cy="108"
                  r="34"
                  fill="none"
                  pathLength="100"
                  strokeDasharray={`${DONUT_FILL} 100`}
                  strokeLinecap="round"
                  className="stroke-(--color-accent-on-brand)"
                  strokeWidth="12"
                />
              </g>
              <path
                d="M190 160h48M198 168h32"
                className="stroke-(--color-on-brand-line)/40"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </g>
          </g>
        </g>
      </svg>
    </div>
  );
}
