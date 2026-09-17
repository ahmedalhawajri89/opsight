'use client';

import { cn } from '@/lib/cn';
import { SkeletonTable } from '@/components/ui/Skeleton';
import { EmptyState, ErrorState, NoResultsState } from './States';

/**
 * The primary interface for operational data.
 *
 * Built in-house, with no table library. Sorting, filtering and pagination all
 * happen on the SERVER, so the client table is presentational — rows in, cells
 * out. TanStack Table's value is client-side data manipulation this application
 * deliberately does not do (FRONTEND_ARCHITECTURE.md §8).
 *
 * Column config:
 *   {
 *     key:      'total_amount',
 *     header:   'Total',
 *     sortable: true,
 *     numeric:  true,            // end-aligned + tabular figures
 *     width:    '12rem',
 *     cell:     (row) => <>…</>, // optional renderer
 *   }
 */
export function DataTable({
  columns,
  rows,
  /*
   * Defaults to `row.id`. A resource without one must pass its own — an
   * undefined key makes React reuse the wrong row on re-render, which in a data
   * table means showing one record's numbers under another record's name.
   */
  getRowId = (row) => row.id,
  caption,

  // States. All four are first-class — a table that renders only the success
  // case is incomplete and is treated as such in review.
  loading = false,
  error = null,
  onRetry,
  empty,
  activeFilters = [],
  onClearFilters,

  // Server-driven sort
  sort,
  onSortChange,

  onRowClick,
  density = 'comfortable',
  /*
   * Drop the table's own frame when it sits inside a panel that already has
   * one — a bordered table inside a bordered card is a box in a box, and the
   * second edge adds nothing but noise.
   */
  bare = false,
  className,
}) {
  const rowHeight = density === 'compact' ? 'h-9' : 'h-11';

  if (loading) {
    return (
      <Shell className={className} bare={bare}>
        <SkeletonTable columns={columns.length} rows={6} />
      </Shell>
    );
  }

  if (error) {
    return (
      <Shell className={className} bare={bare}>
        <ErrorState error={error} onRetry={onRetry} />
      </Shell>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <Shell className={className} bare={bare}>
        {activeFilters.length > 0 ? (
          <NoResultsState activeFilters={activeFilters} onClear={onClearFilters} />
        ) : (
          (empty ?? <EmptyState title="Nothing here yet" />)
        )}
      </Shell>
    );
  }

  return (
    <Shell className={className} bare={bare}>
      {/* Only the table scrolls horizontally; the page body never does. */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}

          <thead>
            <tr className="border-b border-(--color-line) bg-(--color-surface-sunken)/70">
              {columns.map((column) => (
                <HeaderCell
                  key={column.key}
                  column={column}
                  sort={sort}
                  onSortChange={onSortChange}
                />
              ))}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  // Subtle separators and a hover on every row: in a dense
                  // table the eye needs help staying on a line as it crosses
                  // from a name to a figure.
                  'border-b border-(--color-line-subtle) transition-colors duration-150 last:border-b-0',
                  'hover:bg-(--color-surface-hover)/70',
                  rowHeight,
                  onRowClick && 'cursor-pointer',
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={cn(
                      'px-3 align-middle text-(--color-text) first:ps-5 last:pe-5',
                      // Numbers are end-aligned with tabular figures so columns
                      // of currency line up and can be scanned.
                      // …and never wrap: a figure or date broken over two
                      // lines cannot be read down a column. A narrow screen
                      // scrolls the table sideways instead.
                      column.numeric && 'tabular text-end whitespace-nowrap',
                      column.mono && 'font-mono text-[0.8125rem]',
                      column.className,
                    )}
                  >
                    {column.cell ? column.cell(row) : (row[column.key] ?? '—')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function Shell({ bare, className, children }) {
  return (
    <div
      className={cn(
        'overflow-hidden bg-(--color-surface)',
        !bare && 'rounded-(--radius-lg) border border-(--color-line) shadow-(--shadow-card)',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * A sortable header is a real <button> inside a <th scope="col">, carrying
 * aria-sort. Screen readers announce the sort state; keyboard users can reach
 * and activate it. A clickable <th> with an onClick does neither.
 */
function HeaderCell({ column, sort, onSortChange }) {
  const active = sort === column.key || sort === `-${column.key}`;
  const descending = sort === `-${column.key}`;

  const ariaSort = !active ? 'none' : descending ? 'descending' : 'ascending';

  function toggle() {
    if (!onSortChange) return;

    // First click sorts ascending; clicking the active column flips it.
    onSortChange(active && !descending ? `-${column.key}` : column.key);
  }

  return (
    <th
      scope="col"
      style={column.width ? { width: column.width } : undefined}
      aria-sort={column.sortable ? ariaSort : undefined}
      className={cn(
        'px-3 py-2.5 text-[0.6875rem] font-medium tracking-[0.05em] whitespace-nowrap uppercase first:ps-5 last:pe-5',
        'text-(--color-text-muted)',
        // Header alignment follows its column so the label sits over its data.
        column.numeric ? 'text-end' : 'text-start',
      )}
    >
      {column.sortable ? (
        <button
          type="button"
          onClick={toggle}
          className={cn(
            // Buttons reset text-transform and letter-spacing in Tailwind's
            // preflight, so a sortable header rendered in sentence case beside
            // uppercase static ones. Inherit both from the <th> instead.
            'inline-flex items-center gap-1 rounded-[2px] tracking-[inherit] uppercase transition-colors hover:text-(--color-text)',
            active && 'text-(--color-text)',
          )}
        >
          {column.header}
          <SortIndicator active={active} descending={descending} />
        </button>
      ) : (
        column.header
      )}
    </th>
  );
}

function SortIndicator({ active, descending }) {
  return (
    <span
      aria-hidden="true"
      className={cn('text-[0.5rem] leading-none', active ? 'opacity-100' : 'opacity-35')}
    >
      {active && descending ? '▼' : '▲'}
    </span>
  );
}
