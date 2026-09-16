'use client';

import { useId, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Tooltip.
 *
 * Opens on hover AND on focus, so it is reachable by keyboard — a hover-only
 * tooltip simply does not exist for anyone not using a mouse.
 *
 * Tied to its trigger with aria-describedby rather than title, because native
 * titles are slow, unstyleable and inconsistently announced.
 *
 * Tooltips carry supplementary information only. Anything a user must read to
 * complete a task belongs on the page.
 */
export function Tooltip({ content, side = 'top', children, className }) {
  const id = useId();
  const [open, setOpen] = useState(false);

  if (!content) return children;

  const positions = {
    top: 'bottom-full start-1/2 -translate-x-1/2 mb-1.5',
    bottom: 'top-full start-1/2 -translate-x-1/2 mt-1.5',
    start: 'end-full top-1/2 -translate-y-1/2 me-1.5',
    end: 'start-full top-1/2 -translate-y-1/2 ms-1.5',
  };

  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <span aria-describedby={open ? id : undefined}>{children}</span>

      {open && (
        <span
          id={id}
          role="tooltip"
          className={cn(
            'absolute z-50 w-max max-w-[16rem] rounded-[--radius-sm] px-2 py-1',
            'border border-[--color-line] bg-[--color-surface-raised] text-[--color-text]',
            'text-[0.8125rem] leading-snug shadow-[--shadow-overlay]',
            positions[side] ?? positions.top,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

/**
 * The ⓘ affordance beside a metric label.
 *
 * Carries the metric's plain-language definition from METRICS.md, so a user can
 * always find out what a number means without leaving the page. This is the
 * difference between a dashboard people trust and one they quietly stop using
 * (UI_UX_DIRECTION.md §6).
 */
export function InfoTip({ label, content }) {
  return (
    <Tooltip content={content}>
      <button
        type="button"
        aria-label={`What is ${label}?`}
        className="rounded-full text-[--color-text-subtle] transition-colors hover:text-[--color-text-muted]"
      >
        <svg viewBox="0 0 16 16" className="size-3.5" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.25" />
          <path d="M8 7v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="8" cy="4.75" r="0.85" fill="currentColor" />
        </svg>
      </button>
    </Tooltip>
  );
}
