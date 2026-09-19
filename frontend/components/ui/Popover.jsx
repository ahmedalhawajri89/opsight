'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * A button that opens a panel beneath it — the user menu, notifications.
 *
 * Deliberately small: it closes on Escape, on a click outside, and when focus
 * leaves it, and it returns focus to its button on Escape. A panel that opens
 * over content must be as easy to leave as to open, and a keyboard user who
 * presses Escape must land back where they started.
 *
 * `trigger` receives the props a disclosure button needs (aria-expanded,
 * aria-controls, onClick) so the caller keeps control of how it looks.
 */
export function Popover({ trigger, children, align = 'end', className, panelClassName }) {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const button = useRef(null);
  const id = useId();

  useEffect(() => {
    if (!open) return undefined;

    const onPointer = (event) => {
      if (!root.current?.contains(event.target)) setOpen(false);
    };

    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={root}
      className={cn('relative', className)}
      onBlur={(event) => {
        if (open && !root.current?.contains(event.relatedTarget)) setOpen(false);
      }}
    >
      {trigger({
        ref: button,
        'aria-expanded': open,
        'aria-controls': id,
        onClick: () => setOpen((value) => !value),
      })}

      {open && (
        <div
          id={id}
          className={cn(
            'absolute top-full z-50 mt-2 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-overlay)',
            align === 'end' ? 'end-0' : 'start-0',
            panelClassName,
          )}
        >
          {typeof children === 'function' ? children({ close: () => setOpen(false) }) : children}
        </div>
      )}
    </div>
  );
}
