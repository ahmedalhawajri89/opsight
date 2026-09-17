'use client';

import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Server-driven pagination.
 *
 * Reads the `meta` block the API returns and renders it; it never computes page
 * counts from a client-side array, because the client only ever holds one page.
 *
 * Page numbers (rather than cursors) are used for operational tables because
 * the UI needs a total count and jump-to-page, and these tables are small
 * enough for COUNT(*) to be cheap (ARCHITECTURE.md §4).
 */
export function Pagination({ meta, onPageChange, onPerPageChange, className }) {
  const { t } = useI18n();

  if (!meta) return null;

  const {
    current_page: page = 1,
    last_page: lastPage = 1,
    per_page: perPage = 25,
    total = 0,
  } = meta;

  const first = total === 0 ? 0 : (page - 1) * perPage + 1;
  const last = Math.min(page * perPage, total);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-3 border-t border-(--color-line) px-3 py-2',
        className,
      )}
    >
      {/* Announced politely so a screen-reader user hears the page change. */}
      <p
        role="status"
        aria-live="polite"
        className="tabular text-[0.8125rem] text-(--color-text-muted)"
      >
        {total === 0
          ? t('pagination.none')
          : t('pagination.range', {
              first: formatNumber(first),
              last: formatNumber(last),
              total: formatNumber(total),
            })}
      </p>

      <div className="flex items-center gap-3">
        {onPerPageChange && (
          <label className="flex items-center gap-1.5 text-[0.8125rem] text-(--color-text-muted)">
            {t('pagination.rows')}
            <select
              value={perPage}
              onChange={(event) => onPerPageChange(Number(event.target.value))}
              className="h-7 rounded-(--radius-sm) border border-(--color-line-strong) bg-(--color-surface) px-1.5 text-[0.8125rem] text-(--color-text)"
            >
              {[25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {formatNumber(size)}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label={t('pagination.previousPage')}
          >
            {t('pagination.previous')}
          </Button>

          <span className="tabular px-2 text-[0.8125rem] text-(--color-text-muted)">
            {t('pagination.page', { page: formatNumber(page), pages: formatNumber(lastPage) })}
          </span>

          <Button
            size="sm"
            variant="ghost"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= lastPage}
            aria-label={t('pagination.nextPage')}
          >
            {t('pagination.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
