'use client';

import { useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * A figure's recent shape, drawn small beneath it.
 *
 * Plain SVG rather than Recharts: a sparkline has no axes, no tooltip and no
 * interaction, and a charting library per KPI card would be six ResizeObservers
 * to draw six lines.
 *
 * DECORATIVE BY DESIGN, and hidden from assistive technology. It adds shape,
 * not information — the card's figure and comparison carry the facts, and the
 * full series is one click away as a table on the chart it summarises. A
 * sparkline that is the only place a fact appears would break that rule.
 *
 * The values are the API's series as sent; nothing is computed except where
 * each point sits. A flat or single-point series draws a flat line rather than
 * dividing by a zero range.
 */
export function Sparkline({ values = [], colour = 'var(--chart-1)', height = 36, className }) {
  const gradientId = useId();
  // A bucket with no value (a ratio over nothing) is skipped, not drawn as zero.
  const numbers = values.filter((value) => value !== null && value !== undefined).map(Number);

  if (numbers.length < 2) {
    return <div aria-hidden="true" style={{ height }} className={className} />;
  }

  const width = 100;
  const min = Math.min(...numbers);
  const max = Math.max(...numbers);
  const range = max - min || 1;
  const inset = 3;

  const points = numbers.map((value, index) => [
    (index / (numbers.length - 1)) * width,
    inset + (1 - (value - min) / range) * (height - inset * 2),
  ]);

  const line = points
    .map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`)
    .join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn('line-reveal block w-full overflow-visible rtl:-scale-x-100', className)}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={colour} stopOpacity="0.26" />
          <stop offset="100%" stopColor={colour} stopOpacity="0" />
        </linearGradient>
      </defs>

      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={colour}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
