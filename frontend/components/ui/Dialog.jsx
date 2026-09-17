'use client';

import { useCallback, useEffect, useRef } from 'react';

import { cn } from '@/lib/cn';
import { Button } from './Button';

/**
 * Modal dialog.
 *
 * Built on the native <dialog> element so focus trapping, Escape handling, the
 * top layer and inertness of the background come from the platform rather than
 * from hand-written key handlers that are subtly wrong.
 *
 * Focus is restored to the trigger on close — a keyboard user who closes a
 * dialog and lands at the top of the document has lost their place.
 */
export function Dialog({ open, onClose, title, description, footer, size = 'md', children }) {
  const ref = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    const element = ref.current;

    if (!element) return;

    if (open && !element.open) {
      previouslyFocused.current = document.activeElement;
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  const handleClose = useCallback(() => {
    previouslyFocused.current?.focus?.();
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    const element = ref.current;

    if (!element) return undefined;

    // Fires for Escape as well as for element.close().
    element.addEventListener('close', handleClose);

    return () => element.removeEventListener('close', handleClose);
  }, [handleClose]);

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? 'dialog-title' : undefined}
      // Clicking the backdrop closes; clicking the panel must not.
      onClick={(event) => {
        if (event.target === ref.current) ref.current.close();
      }}
      className={cn(
        'w-[calc(100vw-2rem)] rounded-(--radius-md) border border-(--color-line) p-0',
        'bg-(--color-surface) text-(--color-text) shadow-(--shadow-overlay)',
        'backdrop:bg-black/40',
        widths[size] ?? widths.md,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-(--color-line) px-4 py-3">
        <div>
          {title && (
            <h2 id="dialog-title" className="text-sm font-semibold text-(--color-text)">
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-1 text-[0.8125rem] text-(--color-text-muted)">{description}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label="Close dialog"
          className="-me-1 rounded-(--radius-sm) p-1 text-(--color-text-subtle) hover:bg-(--color-surface-hover) hover:text-(--color-text)"
        >
          <svg viewBox="0 0 16 16" className="size-4" fill="none" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      {children && <div className="px-4 py-4 text-sm">{children}</div>}

      {footer && (
        <div className="flex justify-end gap-2 border-t border-(--color-line) bg-(--color-surface-sunken) px-4 py-3">
          {footer}
        </div>
      )}
    </dialog>
  );
}

/**
 * Confirmation for a destructive action.
 *
 * `consequence` is required and must be stated in BUSINESS terms — "returns 12
 * units to stock and removes BHD 840.000 from August revenue", not "Are you
 * sure?". A confirmation that does not say what will happen is a speed bump,
 * not a safeguard (UI_UX_DIRECTION.md §7).
 */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  consequence,
  confirmLabel = 'Confirm',
  loading = false,
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-(--color-text-muted)">{consequence}</p>
    </Dialog>
  );
}
