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
 *     primary:  true,            // THE figure of the row: headlines its card
 *                                // on a phone. At most one per table; a
 *                                // table with no money names none.
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
          (empty ?? <EmptyState />)
        )}
      </Shell>
    );
  }

  return (
    <Shell className={className} bare={bare}>
      {/*
        A phone gets one card per record instead of a table.

        WHY. The page body never scrolled sideways, so nothing looked broken —
        but the table inside did, and on a 390px screen the orders table was
        732px wide, activity 952px. The order reference wrapped onto three
        lines, the customer name onto two, and the total sat off-screen
        entirely: you could not see who an order was for and what it came to
        at the same time. A column of figures is worth scrolling sideways for
        on a laptop and worth nothing on a phone, because there is no column
        left to compare down.

        So below md the same cells are stacked: the first column titles the
        card, the last numeric column sits opposite it — the two things
        anybody scanning a list is looking for — and the rest become labelled
        rows. Every value still goes through its column's own `cell`
        renderer, so a badge is the same badge and a figure the same figure;
        this is a different arrangement of the table, not a second table.
      */}
      <MobileRows
        columns={columns}
        rows={rows}
        getRowId={getRowId}
        caption={caption}
        onRowClick={onRowClick}
      />

      {/* Only the table scrolls horizontally; the page body never does. */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-base">
          {caption && <caption className="sr-only">{caption}</caption>}

          <thead>
            <tr className="border-b border-(--color-line) bg-(--color-ground)/70">
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
                      column.mono && 'font-mono text-sm',
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

/**
 * The same rows, stacked, for a screen too narrow to hold a table.
 *
 * It takes no extra configuration from the seven screens that use DataTable.
 * Asking each of them to nominate a title and a figure would be seven more
 * places to keep in step, and the convention is already true of every one of
 * them: the first column identifies the record and the last numeric column is
 * what it came to.
 *
 * Clicking a card does what clicking a row does, and no more. The desktop
 * `<tr>` carries a bare `onClick` with no role and no tabindex — row click is
 * a mouse convenience there, and the keyboard path is the link inside the
 * first cell. This keeps exactly that bargain rather than dressing a div up
 * as a button and inheriting a promise the table never made.
 */
function MobileRows({ columns, rows, getRowId, caption, onRowClick }) {
  const [title, ...others] = columns;

  /*
   * The figure a reader is scanning for, named by the table rather than
   * guessed from it — and it has to be named, because two conventions tried
   * here were both wrong. The last numeric column put gross profit at the
   * head of an order card with the order's own total three rows down. The
   * first numeric column put the DATE there, because `numeric` on this table
   * means "tabular figures, end-aligned, never wrapped" and a date is all
   * three. Nothing in a column's config distinguishes money from a timestamp,
   * so nothing in this component can either.
   *
   * A table with no money in it — activity, users, customers — names no
   * primary column and gets no headline figure, which is the right answer
   * rather than a missing one.
   */
  const figure = others.find((column) => column.primary);
  const details = others.filter((column) => column !== figure);

  const render = (column, row) => (column.cell ? column.cell(row) : (row[column.key] ?? '—'));

  return (
    <ul aria-label={caption} className="divide-y divide-(--color-line-subtle) md:hidden">
      {rows.map((row) => (
        <li
          key={getRowId(row)}
          onClick={onRowClick ? () => onRowClick(row) : undefined}
          className={cn('px-4 py-3.5', onRowClick && 'cursor-pointer')}
        >
          <div className="flex items-start justify-between gap-3">
            <span
              className={cn(
                'min-w-0 font-medium text-(--color-text)',
                title.mono && 'font-mono text-sm',
              )}
            >
              {render(title, row)}
            </span>

            {figure && (
              <span className="tabular shrink-0 font-semibold whitespace-nowrap text-(--color-text)">
                {render(figure, row)}
              </span>
            )}
          </div>

          {details.length > 0 && (
            <dl className="mt-2.5 space-y-1.5">
              {details.map((column) => (
                <div key={column.key} className="flex items-baseline justify-between gap-4">
                  {/*
                    A column with no header is an actions column: its cell is
                    the whole point and a blank label beside it would only
                    take width from it.
                  */}
                  {column.header && (
                    <dt className="shrink-0 text-xs text-(--color-text-2)">{column.header}</dt>
                  )}
                  <dd
                    className={cn(
                      'min-w-0 text-end text-sm text-(--color-text)',
                      !column.header && 'w-full',
                      column.numeric && 'tabular whitespace-nowrap',
                      column.mono && 'font-mono text-xs',
                    )}
                  >
                    {render(column, row)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </li>
      ))}
    </ul>
  );
}

function Shell({ bare, className, children }) {
  return (
    <div
      className={cn(
        'overflow-hidden bg-(--color-surface)',
        !bare && 'rounded-(--radius-card) border border-(--color-line) shadow-(--shadow-card)',
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
        'px-3 py-2.5 text-xs font-medium tracking-[0.05em] whitespace-nowrap uppercase first:ps-5 last:pe-5',
        'text-(--color-text-2)',
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
