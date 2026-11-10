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
/**
 * The type a chart draws its own labels in.
 *
 * WHY THIS IS A CONSTANT AND NOT A NUMBER AT EACH AXIS. Recharts takes a
 * pixel size rather than a class, so every tick, every label and every
 * legend was carrying its own `fontSize` — twelve of them across six
 * charts, eleven at 11px and one at 10. Neither is on the type scale.
 * UI_UX_DIRECTION.md §3 lists seven sizes and says plainly that "a size
 * outside the table is a bug"; the smallest is 12.
 *
 * Eleven pixels of Arabic is also simply harder to read than eleven pixels
 * of Latin — the script carries its meaning in marks above and below the
 * line, and they are the first thing to go.
 *
 * `--text-2` rather than `--muted`: an axis is read, not glanced at, and
 * the two charts that used the lighter token were a shade quieter than the
 * four that did not, for no reason either of them recorded.
 */
export const CHART_TYPE = {
  size: 12,
  tick: { fill: 'var(--text-2)', fontSize: 12 },
  /* A direct label on a mark: the same size, one step quieter. */
  label: { fill: 'var(--text-2)', fontSize: 12 },
};

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
  bare = false,
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
        'flex min-w-0 flex-col',
        /*
         * `bare` drops the frame, the same way DataTable's does and for the
         * same reason: this section is already inside something that drew a
         * card, and a card inside a card is two borders saying one thing.
         */
        !bare &&
          'rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card)',
        className,
      )}
    >
      <div
        className={cn(
          'flex flex-wrap items-start justify-between gap-3 pb-2',
          bare ? 'px-0 pt-0' : 'px-5 pt-4',
        )}
      >
        {/*
          An empty heading is worse than no heading, so a frame with no title
          renders none — and the spacer keeps the controls at the end edge,
          which justify-between would otherwise hand to the start.
        */}
        {title ? <PanelTitle title={title} description={description} icon={icon} /> : <span />}

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

      {legend && !loading && hasData && !asTable && (
        <div className={cn('pt-1', bare ? 'px-0' : 'px-5')}>{legend}</div>
      )}

      <div className={cn('flex-1 pt-2', bare ? 'px-0 pb-0' : 'px-5 pb-5')}>
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

              IN A DIV, NOT ON THE TABLE. `sr-only` shrinks a box to 1px, but
              a table's height is a minimum that its rows override: a 30-day
              table stayed 739px tall, invisible, and lengthened the page past
              its own column. That broke the sidebar's `sticky`, which can
              only hold within its parent, so the sidebar scrolled away and
              left an empty strip. The div clips; the table inside keeps every
              row and its table semantics.
            */}
            <div className="sr-only">
              <table>
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
            </div>
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
