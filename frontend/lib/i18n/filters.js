/**
 * The active filters of a list, as the reader should see them named.
 *
 * Before localization these were built as `${key}: ${value}` — "placed_from:
 * 2026-08-01" — which shows an API parameter name to a user in any language.
 * Each key now has a label in the dictionaries (`filters.<key>`), and values
 * that are themselves vocabulary (an order status, a yes/no flag) are
 * translated too. Free-text values — a search term, a date — are shown as
 * typed.
 */
export function describeFilters(activeKeys, filters, t) {
  return activeKeys.map((key) => `${t(`filters.${key}`)}: ${describeValue(key, filters[key], t)}`);
}

function describeValue(key, value, t) {
  if (key === 'status') return t(`orderStatus.${value}`);
  if (key === 'payment_status') return t(`paymentStatus.${value}`);
  if (key === 'role') return t(`roles.${value}`);

  if (key === 'is_active' || key === 'low_stock') {
    return value === 'true' || value === true || value === '1' ? t('common.yes') : t('common.no');
  }

  return String(value);
}
