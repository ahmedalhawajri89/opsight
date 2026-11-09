'use client';

import { useCallback, useEffect, useId, useRef } from 'react';

import { cn } from '@/lib/cn';
import { Button } from './Button';
import { useI18n } from '@/features/i18n/I18nProvider';

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
  const { t } = useI18n();
  const ref = useRef(null);
  const previouslyFocused = useRef(null);
  /*
   * A title id per instance. Two dialogs are mounted together on several
   * screens, and a shared id gave one of them the other's accessible name.
   */
  const titleId = useId();

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

  const widths = { sm: 'sm:max-w-sm', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' };

  return (
    <dialog
      ref={ref}
      aria-labelledby={title ? titleId : undefined}
      // Clicking the backdrop closes; clicking the panel must not.
      onClick={(event) => {
        if (event.target === ref.current) ref.current.close();
      }}
      className={cn(
        /*
         * `m-auto` IS THE CENTRING, and it has to be written out.
         *
         * The browser's own stylesheet centres an open modal dialog with
         * `margin: auto` against `inset: 0`. Tailwind's preflight resets the
         * margin on every element to 0, which quietly removed it — leaving
         * `inset: 0` on its own, and with that every dialog in the product
         * was pinned to the inline-start top corner of the screen: top-right
         * in Arabic, top-left in English. Measured at 1512x945, the edit
         * panel sat at x=1000, y=0, flush into the corner.
         *
         * On a phone the same rule turns it into a sheet instead: margin-top
         * auto, margin-bottom nothing, so it rises from the bottom edge where
         * a thumb is, full width, with only its top corners rounded.
         */
        'm-auto max-sm:mt-auto max-sm:mb-0 max-sm:rounded-b-none',

        /*
         * A COLUMN THAT CANNOT OUTGROW THE SCREEN.
         *
         * It used to have no height limit at all, so the panel simply grew
         * past the viewport and took its own footer with it: at 1280x720 the
         * save button sat 115px below the fold, and on a 390px phone 364px
         * below it, with nothing on screen to say it was there. The three
         * rows below are header / body / footer, and only the middle one
         * scrolls — `minmax(0,1fr)` because a grid row refuses to shrink
         * under its content without it, which is the usual reason a layout
         * like this silently does nothing.
         */
        /*
         * `open:grid`, NEVER a bare `grid`. The browser hides a closed dialog
         * with `dialog:not([open]) { display: none }`, and a class beats an
         * element selector on specificity — so `display: grid` written
         * unconditionally overrode it and every closed dialog on the page
         * started rendering. They are invisible enough to miss by eye and
         * they still take pointer events and still carry role="dialog", so
         * the screens that mount two of them had a transparent sheet over
         * the content and `getByRole('dialog')` matched three elements at
         * once. Eleven browser tests caught it; no screenshot would have.
         */
        'open:grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] max-sm:max-h-[85dvh]',

        /*
         * `100%`, not `100vw`: the viewport unit includes the width of a
         * classic scrollbar, so a panel sized in `vw` is wider than the space
         * it has and pushes the page sideways.
         */
        'w-full max-w-[calc(100%-2rem)] max-sm:max-w-full',

        'rounded-(--radius-card) border border-(--color-line) p-0',
        'bg-(--color-surface) text-(--color-text) shadow-(--shadow-overlay)',
        'backdrop:bg-black/50 backdrop:backdrop-blur-[2px]',
        widths[size] ?? widths.md,
      )}
    >
      <div className="flex items-start justify-between gap-4 border-b border-(--color-line) px-5 py-4">
        <div className="min-w-0">
          {title && (
            <h2 id={titleId} className="text-base font-semibold text-(--color-text)">
              {title}
            </h2>
          )}
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-(--color-text-2)">{description}</p>
          )}
        </div>

        {/*
          44px, not 24px. It is the only way out for a pointer that will not
          aim, and it used to be a 16px glyph with 4px of padding around it.
        */}
        <button
          type="button"
          onClick={() => ref.current?.close()}
          aria-label={t('dialog.close')}
          className="-me-2 -mt-1 inline-flex size-11 shrink-0 items-center justify-center rounded-(--radius-control) text-(--color-muted) hover:bg-(--color-surface-hover) hover:text-(--color-text) sm:size-9"
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

      {/*
        The one row that scrolls. `min-h-0` for the same reason as the track
        above, and the empty div keeps the grid's three rows when a dialog is
        opened with no body — otherwise the footer takes the middle row and
        stretches down the panel.
      */}
      <div className="min-h-0 overflow-y-auto px-5 py-4 text-base">{children}</div>

      {footer && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-(--color-line) bg-(--color-ground) px-5 py-3">
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
  confirmLabel,
  loading = false,
  /*
   * For a confirmation the reader must not be able to give by reflex — an
   * irreversible erasure asks them to type the name first (ADR-026).
   */
  confirmDisabled = false,
  children,
}) {
  const { t } = useI18n();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t('common.cancel')}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading} disabled={confirmDisabled}>
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </>
      }
    >
      <p className="text-(--color-text-2)">{consequence}</p>

      {/*
        Rendered below the consequence. It was previously accepted and silently
        dropped, so the only caller that passed content — the cancellation
        reason field, which the server REQUIRES — never appeared, and no order
        could be cancelled from the screen.
      */}
      {children && <div className="mt-4">{children}</div>}
    </Dialog>
  );
}
