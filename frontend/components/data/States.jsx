'use client';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/features/i18n/I18nProvider';

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
  const { t } = useI18n();

  return (
    <Frame className={className}>
      {icon && <div className="text-(--color-text-subtle)">{icon}</div>}

      <div className="space-y-1">
        <p className="text-sm font-medium text-(--color-text)">{title ?? t('states.empty')}</p>
        {description && (
          <p className="mx-auto max-w-sm text-[0.8125rem] text-(--color-text-muted)">
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
  const { t, tag } = useI18n();

  return (
    <Frame className={className}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-(--color-text)">{t('states.noResults.title')}</p>
        <p className="mx-auto max-w-md text-[0.8125rem] text-(--color-text-muted)">
          {activeFilters.length > 0 ? (
            <>
              {t('states.noResults.matching')}{' '}
              {/*
                Joined by Intl.ListFormat, not by ", ": the separator and the
                word before the last item are the language's ("a, b and c" /
                "أ وب وج"), and a hand-built comma list is English-only.
              */}
              {new Intl.ListFormat(tag, { type: 'conjunction' })
                .formatToParts(activeFilters)
                .map((part, index) =>
                  part.type === 'element' ? (
                    <span key={index} className="font-medium text-(--color-text)">
                      {part.value}
                    </span>
                  ) : (
                    <span key={index}>{part.value}</span>
                  ),
                )}
            </>
          ) : (
            t('states.noResults.description')
          )}
        </p>
      </div>

      {onClear && (
        <Button variant="secondary" size="sm" onClick={onClear}>
          {t('states.noResults.clear')}
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
 *
 * A server error's message is already in the reader's language — the API
 * writes it. A failure that never reached the server has no server message, so
 * it is named by its code here instead.
 */
export function ErrorState({ title, error, onRetry, className }) {
  const { t } = useI18n();

  const message =
    error?.code === 'network.unreachable'
      ? t('states.error.network')
      : (error?.message ?? t('states.error.unexpected'));
  const reference = error?.reference;

  return (
    <Frame className={className}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-(--color-negative)">
          {title ?? t('states.error.title')}
        </p>
        <p className="mx-auto max-w-md text-[0.8125rem] text-(--color-text-muted)">{message}</p>
        {reference && (
          <p className="font-mono text-[0.6875rem] text-(--color-text-subtle)">
            {t('states.error.reference', { reference })}
          </p>
        )}
      </div>

      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t('states.error.retry')}
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
  const { t } = useI18n();

  return (
    <Frame className={className}>
      <div className="space-y-1">
        <p className="text-sm font-medium text-(--color-text)">{t('states.forbidden.title')}</p>
        <p className="mx-auto max-w-md text-[0.8125rem] text-(--color-text-muted)">
          {t('states.forbidden.description')}
        </p>
      </div>
    </Frame>
  );
}
