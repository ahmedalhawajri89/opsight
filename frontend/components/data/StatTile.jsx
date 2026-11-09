'use client';

import { cn } from '@/lib/cn';
import { EMPTY } from '@/lib/format';
import { PartialBadge } from '@/components/ui/Badge';
import { InfoTip } from '@/components/ui/Tooltip';
import { Skeleton } from '@/components/ui/Skeleton';
import { ComparisonValue } from './ComparisonValue';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * The most-repeated component in the product, so it is specified exactly.
 *
 *   ┌─────────────────────────────────┐
 *   │ NET REVENUE                  ⓘ  │  label · uppercase · muted
 *   │ BHD 48,210.500                  │  display · 600 · tabular
 *   │ ▲ 9.6%   vs previous 30 days    │  direction-coloured + arrow + basis
 *   └─────────────────────────────────┘
 *
 * Non-negotiables:
 *  - `value` arrives pre-formatted. This component does not do arithmetic and
 *    does not know what a currency is; the caller used lib/format.
 *  - A missing value renders as an em dash with a reason, never as 0.
 *  - The comparison basis is always in words.
 *  - A partial period is badged on the tile itself.
 */
export function StatTile({
  label,
  value,
  definition,
  change,
  changeFormat = 'percent',
  favourable = 'up',
  comparisonBasis,
  previousLabel,
  partial = false,
  loading = false,
  emptyReason,
  bare = false,
  className,
  children,
}) {
  const { t } = useI18n();

  if (loading) {
    return (
      <div className={cn(FRAME(bare), className)} aria-busy="true">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="mt-3 h-7 w-36" />
        <Skeleton className="mt-3 h-3 w-32" />
      </div>
    );
  }

  const isEmpty = value === null || value === undefined || value === EMPTY;

  return (
    <div className={cn(FRAME(bare), className)}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-(--color-text-2)">
          {label}
        </h3>

        <div className="flex items-center gap-1.5">
          {partial && <PartialBadge />}
          {definition && <InfoTip label={label} content={definition} />}
        </div>
      </div>

      <p
        className={cn(
          // 1.5rem, and allowed to wrap between currency and amount: at 2rem a
          // six-figure BHD value ("BHD 639,615.570") ran past a quarter-width
          // tile and was clipped by its neighbour.
          'tabular mt-2 text-2xl leading-[1.2] font-semibold tracking-tight break-words',
          isEmpty ? 'text-(--color-muted)' : 'text-(--color-text)',
        )}
        title={isEmpty ? (emptyReason ?? t('comparison.noValue')) : undefined}
      >
        {isEmpty ? EMPTY : value}
      </p>

      {change !== undefined && (
        <ComparisonValue
          change={change}
          format={changeFormat}
          favourable={favourable}
          basis={comparisonBasis}
          previousLabel={previousLabel}
          className="mt-2"
        />
      )}

      {children}
    </div>
  );
}

/**
 * A responsive grid of tiles.
 *
 * The dashboard endpoint returns a different SET of keys per role — cost tiles
 * are absent, not null, for cost-blind roles — so this renders whatever it is
 * given rather than assuming a fixed shape (ROLES_AND_PERMISSIONS.md §4).
 */
/*
 * The tile's own edges — which a tile inside a divided panel must not draw.
 *
 * UI_UX_DIRECTION.md §5: "A group of figures that describe one period is ONE
 * panel divided by hairlines, not a grid of identically framed tiles. Twelve
 * equal boxes give the eye no place to start." The analytics screen had
 * fifteen. `bare` lets the panel own the edge and the hairlines, exactly as
 * `bare` does for a DataTable inside a Card.
 */
const FRAME = (bare) =>
  bare
    ? 'bg-(--color-surface) p-4'
    : 'rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4';

export function StatGrid({ className, children }) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>{children}</div>
  );
}
