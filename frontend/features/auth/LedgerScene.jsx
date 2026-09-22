'use client';

import { useI18n } from '@/features/i18n/I18nProvider';

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
 * The drawing is left to right in both languages, like every real chart in
 * Opsight. Motion lives in globals.css (`ledger-*`); under reduced motion the
 * global rule collapses every animation to its end, which is the finished
 * figure — so the static scene is the right scene, with no second code path.
 */

/* A record's kind decides its chip colour. Six rows, three kinds. */
const ROWS = [
  { kind: 'chart-1', width: 196 },
  { kind: 'chart-2', width: 148 },
  { kind: 'chart-1', width: 172 },
  { kind: 'chart-3', width: 124 },
  { kind: 'chart-1', width: 184 },
  { kind: 'chart-2', width: 136 },
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

const STEPS = [
  { key: 'records', delay: '0ms' },
  { key: 'computed', delay: '1000ms' },
  { key: 'figure', delay: '1900ms' },
];

export function LedgerScene() {
  const { t } = useI18n();

  return (
    <figure className="mt-10">
      <svg
        role="img"
        aria-label={t('login.scene.label')}
        viewBox="0 0 480 220"
        dir="ltr"
        className="h-auto w-full"
        fill="none"
      >
        {/* The rule every figure stands on. */}
        <line x1="36" x2="444" y1={BASELINE} y2={BASELINE} stroke="var(--border)" strokeWidth="2" />

        {/* 1 — records arrive. */}
        {ROWS.map((row, index) => (
          <g key={index} className="ledger-row" style={{ '--i': index }}>
            <circle cx="46" cy={28 + index * 24} r="5" fill={`var(--${row.kind})`} />
            <rect
              x="60"
              y={23 + index * 24}
              width={row.width}
              height="10"
              rx="5"
              fill="var(--surface-hover)"
            />
          </g>
        ))}

        {/* 2 — a figure rises where they were. */}
        {COLUMNS.map((column, index) => (
          <rect
            key={index}
            className="ledger-col"
            style={{ '--i': index }}
            x={column.x}
            y={BASELINE - column.height}
            width={COLUMN_WIDTH}
            height={column.height}
            rx="6"
            fill="var(--brand-soft)"
          />
        ))}

        {/* 3 — the line reads it, and the point marks now. */}
        <polyline
          className="ledger-line"
          points={LINE}
          pathLength="1"
          stroke="var(--brand)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          className="ledger-ring"
          cx={NOW_X}
          cy={NOW_Y}
          r="7"
          stroke="var(--accent)"
          strokeWidth="2"
        />
        <circle className="ledger-dot" cx={NOW_X} cy={NOW_Y} r="5.5" fill="var(--accent)" />
      </svg>

      {/* The three beats, named — lit in turn as the drawing reaches each one. */}
      <figcaption className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        {STEPS.map((step, index) => (
          <span key={step.key} className="inline-flex items-center gap-3">
            {index > 0 && <span aria-hidden="true" className="h-px w-6 bg-(--color-line-strong)" />}
            <span
              className="ledger-step inline-flex items-center gap-2"
              style={{ '--d': step.delay }}
            >
              <span aria-hidden="true" className="ledger-step-dot size-2 rounded-(--radius-pill)" />
              {t(`login.scene.${step.key}`)}
            </span>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
