'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState, ErrorState } from '@/components/data/States';

/**
 * The shell every chart sits in.
 *
 * It owns the four states and — more importantly — the ACCESSIBLE TABLE.
 *
 * A chart is never the only route to its numbers. Every chart here can be
 * switched to the table it was drawn from, which serves a screen-reader user, a
 * colour-blind reader, anyone who wants to copy a figure, and anyone who simply
 * does not trust a line (UI_UX_DIRECTION.md §8).
 *
 * The table is rendered rather than hidden, so it is not a second
 * representation that can silently drift from the first.
 */
export function ChartFrame({
  title,
  description,
  columns,
  rows,
  loading = false,
  error = null,
  onRetry,
  emptyTitle = 'No data for this period',
  emptyDescription,
  footnote,
  actions,
  height = 280,
  className,
  children,
}) {
  const [asTable, setAsTable] = useState(false);

  const hasData = Array.isArray(rows) && rows.length > 0;

  return (
    <section
      className={cn(
        'flex min-w-0 flex-col rounded-(--radius-lg) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card)',
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-4 pb-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-(--color-text)">{title}</h2>
          {description && (
            <p className="tabular mt-0.5 text-[0.8125rem] text-(--color-text-muted)">
              {description}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          {actions}
          {hasData && !loading && !error && (
            <Button size="sm" variant="ghost" onClick={() => setAsTable((value) => !value)}>
              {asTable ? 'View as chart' : 'View as table'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex-1 px-5 pt-2 pb-5">
        {loading ? (
          <div aria-busy="true" style={{ height }}>
            <Skeleton className="size-full" />
          </div>
        ) : error ? (
          // Scoped to the widget: one failing chart must not blank the page.
          <ErrorState error={error} onRetry={onRetry} />
        ) : !hasData ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : asTable ? (
          <DataTable
            caption={title}
            columns={columns}
            rows={rows}
            density="compact"
            bare
            className="-mx-5 border-t border-(--color-line-subtle)"
          />
        ) : (
          <>
            <div style={{ height }}>{children}</div>

            {/*
              The same rows, available to assistive technology without the
              reader having to find and press the toggle first.
            */}
            <table className="sr-only">
              <caption>{title}</caption>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.key ?? row.bucket ?? index}>
                    {columns.map((column) => (
                      <td key={column.key}>
                        {column.cell ? column.cell(row) : (row[column.key] ?? '—')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {footnote && !loading && (
          <p className="mt-3 border-t border-(--color-line-subtle) pt-3 text-xs text-(--color-text-muted)">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
