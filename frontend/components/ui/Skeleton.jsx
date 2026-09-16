'use client';

import { cn } from '@/lib/cn';

/**
 * Loading placeholders.
 *
 * Skeletons match the real layout's dimensions rather than being a generic
 * block, because the point is that nothing moves when the data arrives. A
 * centred spinner guarantees the opposite (UI_UX_DIRECTION.md §11).
 */
export function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn('skeleton rounded-[--radius-sm]', className)}
      aria-hidden="true"
      {...props}
    />
  );
}

export function SkeletonText({ lines = 3, className }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton
          key={index}
          className="h-3.5"
          // A ragged last line reads as text rather than as a grey box.
          style={{ width: index === lines - 1 ? '60%' : '100%' }}
        />
      ))}
    </div>
  );
}

/**
 * A table skeleton with the CORRECT column count.
 *
 * Guessing the column count is what makes a table jump when it loads — the
 * caller passes the real columns so the placeholder is the same shape as the
 * result.
 */
export function SkeletonTable({ columns = 4, rows = 5 }) {
  return (
    <div aria-hidden="true">
      <div className="flex gap-4 border-b border-[--color-line] px-3 py-2">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>

      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 border-b border-[--color-line] px-3 py-3">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStatTile() {
  return (
    <div
      className="rounded-[--radius-md] border border-[--color-line] bg-[--color-surface] p-4"
      aria-hidden="true"
    >
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-36" />
      <Skeleton className="mt-3 h-3 w-32" />
    </div>
  );
}
