'use client';

import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Field';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatNumber } from '@/lib/format';

/**
 * Picking one record out of a catalogue that may be longer than one page.
 *
 * The order form used to load the first hundred products and the first hundred
 * customers and stop there. A hundred is not a generous default — it is the
 * server's own ceiling (`QueryFilter::MAX_PER_PAGE`), so a business with a
 * hundred and one products simply could not sell the last one. And because a
 * failed fetch yields an empty array, a dead API rendered as a dropdown with
 * nothing in it: indistinguishable from an empty catalogue.
 *
 * So this control states which of four situations it is in — loading, failed,
 * nothing matched, or showing only the first N of more — and lets the reader
 * search the rest. The search runs on the server, through the same `search`
 * filter the list screens use, because the records it must reach are by
 * definition not the ones already here.
 *
 * It stays a native `<select>`. A custom listbox would have to re-implement
 * keyboard handling, touch behaviour and the mobile picker, and gain nothing a
 * search box above it does not already give.
 */
export function CatalogPicker({
  label,
  hint,
  required = false,
  className,
  searchLabel,
  searchPlaceholder,
  search,
  onSearchChange,
  placeholder,
  options,
  value,
  selected = null,
  onChange,
  isLoading = false,
  isError = false,
  error = null,
  onRetry,
  total,
}) {
  const { t } = useI18n();

  /*
   * A search that hides what was already chosen would un-choose it: the option
   * leaves the list, the native select shows nothing, and the form still holds
   * an id the reader can no longer see. So the caller passes back what it
   * chose, and it stays in the list however the search narrows.
   */
  const listed = options.some((option) => String(option.value) === String(value));
  const shown =
    selected && !listed && String(selected.value) === String(value)
      ? [selected, ...options]
      : options;

  /*
   * Branch on the code, never on the message (apiClient.js): a request that
   * never reached the server has no server-written message to show.
   */
  const failure = isError
    ? error?.code === 'network.unreachable'
      ? t('states.error.network')
      : (error?.message ?? t('states.error.unexpected'))
    : null;

  const truncated = typeof total === 'number' && total > options.length;

  const status = (() => {
    if (isLoading) return t('common.loading');
    if (options.length === 0 && search !== '') return t('search.noResults', { query: search });
    if (truncated) {
      return t('newOrder.showingFirst', {
        shown: formatNumber(options.length),
        total: formatNumber(total),
      });
    }

    return hint;
  })();

  return (
    <Field label={label} hint={status} error={failure} required={required} className={className}>
      {(props) => (
        <div className="space-y-1.5">
          <Input
            type="search"
            aria-label={searchLabel}
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />

          <Select
            options={shown}
            placeholder={placeholder}
            value={value}
            onChange={onChange}
            disabled={isLoading}
            className="w-full"
            {...props}
          />

          {/* A failure the reader can act on, rather than a list that is
              silently empty. */}
          {failure && onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry}>
              {t('states.error.retry')}
            </Button>
          )}
        </div>
      )}
    </Field>
  );
}
