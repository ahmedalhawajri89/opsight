'use client';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';

/**
 * Empty, filtered-empty and error states.
 *
 * Empty and filtered-empty are DELIBERATELY separate components. Telling a user
 * "No orders yet — create your first one" when they have 4,000 orders and a bad
 * filter is actively misleading, and conflating the two is one of the most
 * common mistakes in admin UIs (FRONTEND_ARCHITECTURE.md §11).
 */

function Frame({ className, children }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 px-6 py-12 text-center',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Nothing exists yet. Offer the action that creates the first record. */
export function EmptyState({ title, description, action, icon, className }) {
  return (
    <Frame className={className}>
      {icon && <div className="text-[--color-text-subtle]">{icon}</div>}

      <div className="space-y-1">
        <p className="text-sm font-medium text-[--color-text]">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-[0.8125rem] text-[--color-text-muted]">
            {description}
          </p>
        )}
      </div>

      {action}
    </Frame>
  );
}

/**
 * Records exist, but none match the current filters.
 *
 * Names the active filters and offers to clear them, so the user can see what
 * excluded their data rather than concluding it is gone.
 */
export function NoResultsState({ activeFilters = [], onClear, className }) {
  return (
    <Frame className={className}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-[--color-text]">No matching records</p>
        <p className="mx-auto max-w-md text-[0.8125rem] text-[--color-text-muted]">
          {activeFilters.length > 0 ? (
            <>
              Nothing matches{' '}
              {activeFilters.map((filter, index) => (
                <span key={filter}>
                  {index > 0 && ', '}
                  <span className="font-medium text-[--color-text]">{filter}</span>
                </span>
              ))}
              .
            </>
          ) : (
            'Nothing matches the current filters.'
          )}
        </p>
      </div>

      {onClear && (
        <Button variant="secondary" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </Frame>
  );
}

/**
 * Something failed.
 *
 * Shows the request reference id so a user can quote it in a bug report and it
 * can be found in the logs — the whole point of returning one (SECURITY.md §11).
 * Scoped to the widget: one failing chart must not blank the dashboard.
 */
export function ErrorState({ title = 'Could not load this', error, onRetry, className }) {
  const message = error?.message ?? 'An unexpected error occurred.';
  const reference = error?.reference;

  return (
    <Frame className={className}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-[--color-negative]">{title}</p>
        <p className="mx-auto max-w-md text-[0.8125rem] text-[--color-text-muted]">{message}</p>
        {reference && (
          <p className="font-mono text-[0.6875rem] text-[--color-text-subtle]">
            Reference: {reference}
          </p>
        )}
      </div>

      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </Frame>
  );
}

/**
 * A direct URL hit on something the role may not access.
 *
 * Navigation is ability-filtered so this is rare, but a bookmarked link or a
 * shared URL will reach it.
 */
export function ForbiddenState({ className }) {
  return (
    <Frame className={className}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-[--color-text]">Not available for your role</p>
        <p className="mx-auto max-w-md text-[0.8125rem] text-[--color-text-muted]">
          Ask an owner if you need access to this area.
        </p>
      </div>
    </Frame>
  );
}
