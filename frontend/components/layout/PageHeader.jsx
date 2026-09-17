'use client';

import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * Page title, optional description, and end-aligned actions.
 *
 * `actions` is where ability-gated buttons go, wrapped in <Can> by the caller —
 * this component does not know about permissions. `children` renders beneath
 * the title row, for page-level context such as a period status line.
 */
export function PageHeader({ title, description, actions, className, children }) {
  return (
    <header className={cn('mb-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-tight text-(--color-text)">
            {title}
          </h1>
          {description && (
            <p className="mt-1.5 max-w-3xl text-[0.8125rem] leading-relaxed text-(--color-text-muted)">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
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
 * times a day (UI_UX_DIRECTION.md §5). Its negative inline margins match the
 * shell's content padding at each breakpoint, so the bar spans edge to edge.
 */
export function FilterBar({ onClear, activeCount = 0, className, children }) {
  return (
    <div
      className={cn(
        'sticky top-13 z-20 -mx-4 mb-4 flex flex-wrap items-end gap-2 border-b border-(--color-line) lg:top-0',
        'bg-(--color-surface-sunken)/95 px-4 py-2.5 backdrop-blur-sm sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8',
        className,
      )}
    >
      {children}

      {activeCount > 0 && onClear && (
        <button
          type="button"
          onClick={onClear}
          className="ms-auto self-center text-[0.8125rem] text-(--color-accent-text) underline-offset-2 hover:underline"
        >
          Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
}

/**
 * A panel.
 *
 * White on the off-white ground, a 1px edge and a hairline shadow. Hierarchy
 * inside the page comes from where a panel sits and how large its type is —
 * not from a heavier frame.
 */
export function Card({
  title,
  description,
  icon,
  actions,
  padded = true,
  className,
  bodyClassName,
  style,
  children,
}) {
  return (
    <section
      style={style}
      className={cn(
        // min-w-0: as a grid or flex child a panel would otherwise grow to fit
        // its widest content, so one unwrappable table widened the whole page
        // on a phone. The table scrolls inside its panel instead.
        'min-w-0 rounded-(--radius-lg) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card)',
        className,
      )}
    >
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-4 pb-3">
          <PanelTitle title={title} description={description} icon={icon} />
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}

      <div
        className={cn(
          padded && (title || actions ? 'px-5 pb-5' : 'p-5'),
          !padded && (title || actions) && 'border-t border-(--color-line-subtle)',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/**
 * A panel's heading block: an optional icon chip, the title, the description.
 *
 * The icon is a wayfinding aid for a page of many panels — it lets the eye
 * find "the stock one" without reading — and is hidden from assistive
 * technology, which has the title.
 */
export function PanelTitle({ title, description, icon }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      {icon && (
        <Icon
          name={icon}
          size={18}
          strokeWidth={2}
          className="mt-px shrink-0 text-(--color-accent)"
        />
      )}
      <div className="min-w-0">
        {title && (
          <h2 className="text-[0.9375rem] leading-snug font-semibold text-(--color-text)">
            {title}
          </h2>
        )}
        {description && <p className="mt-0.5 text-xs text-(--color-text-muted)">{description}</p>}
      </div>
    </div>
  );
}
