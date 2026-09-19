'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { DataTable } from '@/components/data/DataTable';
import { PanelTitle } from '@/components/layout/PageHeader';
import { EmptyState, ErrorState } from '@/components/data/States';
import { useI18n } from '@/features/i18n/I18nProvider';

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
  emptyTitle,
  emptyDescription,
  footnote,
  actions,
  legend,
  icon,
  height = 280,
  className,
  style,
  children,
}) {
  const { t } = useI18n();
  const [asTable, setAsTable] = useState(false);

  const hasData = Array.isArray(rows) && rows.length > 0;

  return (
    <section
      style={style}
      className={cn(
        'flex min-w-0 flex-col rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card)',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 px-5 pt-4 pb-2">
        <PanelTitle title={title} description={description} icon={icon} />

        <div className="flex shrink-0 items-center gap-2">
          {actions}
          {/*
            An icon button, named in words for assistive technology and in a
            tooltip for the pointer. The chart is never the only route to its
            numbers; it just does not need a word in the header to say so.
          */}
          {hasData && !loading && !error && (
            <button
              type="button"
              onClick={() => setAsTable((value) => !value)}
              aria-label={asTable ? t('charts.viewAsChart') : t('charts.viewAsTable')}
              title={asTable ? t('charts.viewAsChart') : t('charts.viewAsTable')}
              aria-pressed={asTable}
              className="inline-flex size-8 items-center justify-center rounded-(--radius-control) text-(--color-muted) transition-colors hover:bg-(--color-surface-hover) hover:text-(--color-text)"
            >
              <Icon name={asTable ? 'analytics' : 'table'} size={16} />
            </button>
          )}
        </div>
      </div>

      {legend && !loading && hasData && !asTable && <div className="px-5 pt-1">{legend}</div>}

      <div className="flex-1 px-5 pt-2 pb-5">
        {loading ? (
          <div aria-busy="true" style={{ height: height === 'auto' ? 200 : height }}>
            <Skeleton className="size-full" />
          </div>
        ) : error ? (
          // Scoped to the widget: one failing chart must not blank the page.
          <ErrorState error={error} onRetry={onRetry} />
        ) : !hasData ? (
          <EmptyState title={emptyTitle ?? t('charts.noData')} description={emptyDescription} />
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
            {/*
              The drawing surface is always laid out left to right. Recharts
              positions every label with SVG text-anchor, and an inherited
              right-to-left direction flips what "start" and "end" mean — the
              category labels of a ranking were drawn across their own bars.
              The charts mirror themselves for Arabic explicitly instead
              (reversed axes, axis on the right), and Arabic text inside the
              SVG still shapes and orders correctly.
            */}
            <div dir="ltr" style={{ height }}>
              {children}
            </div>

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
          <p className="mt-3 border-t border-(--color-line-subtle) pt-3 text-xs text-(--color-text-2)">
            {footnote}
          </p>
        )}
      </div>
    </section>
  );
}
