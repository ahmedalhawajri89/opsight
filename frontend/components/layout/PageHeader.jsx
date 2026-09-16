'use client';

import { cn } from '@/lib/cn';

/**
 * Page title, optional description, and right-aligned actions.
 *
 * `actions` is where ability-gated buttons go, wrapped in <Can> by the caller —
 * this component does not know about permissions.
 */
export function PageHeader({ title, description, actions, className, children }) {
  return (
    <header className={cn('mb-5', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-[--color-text]">{title}</h1>
          {description && (
            <p className="mt-1 text-[0.8125rem] text-[--color-text-muted]">{description}</p>
          )}
        </div>

        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>

      {children}
    </header>
  );
}

/**
 * The sticky filter bar beneath a page header.
 *
 * Sticky so filters stay reachable while scrolling a long table — having to
 * scroll back to the top to change a filter is a small tax paid hundreds of
 * times a day (UI_UX_DIRECTION.md §5).
 */
export function FilterBar({ onClear, activeCount = 0, className, children }) {
  return (
    <div
      className={cn(
        'sticky top-0 z-20 -mx-4 mb-3 flex flex-wrap items-end gap-2 border-b border-[--color-line]',
        'bg-[--color-surface-sunken]/95 px-4 py-2.5 backdrop-blur-sm md:-mx-6 md:px-6',
        className,
      )}
    >
      {children}

      {activeCount > 0 && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ms-auto self-center text-[0.8125rem] text-[--color-accent-text] underline-offset-2 hover:underline"
        >
          Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}

/** A bordered card. Hierarchy comes from the border and spacing, not a shadow. */
export function Card({ title, description, actions, padded = true, className, children }) {
  return (
    <section
      className={cn(
        'rounded-[--radius-md] border border-[--color-line] bg-[--color-surface]',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex items-start justify-between gap-3 border-b border-[--color-line] px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold text-[--color-text]">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-[0.8125rem] text-[--color-text-muted]">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      <div className={padded ? 'p-4' : undefined}>{children}</div>
    </section>
  );
}
