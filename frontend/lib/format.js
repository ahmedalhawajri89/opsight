/**
 * Every number the user sees passes through here.
 *
 * Two rules govern this module:
 *
 * 1. **Money is a string, end to end.** The API sends decimal strings; they are
 *    formatted with Intl and never converted to a JavaScript number for
 *    arithmetic. `0.1 + 0.2` is the reason (ADR-015).
 *
 * 2. **`null` is not zero.** A metric with no value renders as an em dash, never
 *    as `0`, `NaN`, `Infinity` or a blank. "The average order was worth nothing"
 *    is a different and false claim (METRICS.md §1.5).
 */

export const EMPTY = '—';

/**
 * The locale is explicit at every call site so Phase 07 changes one default.
 *
 * `en-GB` rather than `en`: it renders dates day-first ("31 Aug 2026") instead
 * of month-first ("Aug 31, 2026"). For an operations tool that is not a style
 * preference — "03/04" is genuinely ambiguous across locales, and the business
 * this is built for reads dates day-first. Number and currency grouping are
 * identical between the two.
 */
export const DEFAULT_LOCALE = 'en-GB';

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

/**
 * Money.
 *
 * @param {string|number|null} value  decimal string from the API
 * @param {object} options            { currency, decimals, locale, sign }
 */
export function formatMoney(
  value,
  { currency = 'BHD', decimals = 3, locale = DEFAULT_LOCALE, sign = false } = {},
) {
  if (isBlank(value)) return EMPTY;

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return EMPTY;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(numeric);
}

/**
 * Money with the magnitude shortened — for chart axes and tight tiles only,
 * never for a figure someone might reconcile against an invoice.
 */
export function formatMoneyCompact(value, { currency = 'BHD', locale = DEFAULT_LOCALE } = {}) {
  if (isBlank(value)) return EMPTY;

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return EMPTY;

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(numeric);
}

export function formatNumber(value, { decimals = 0, locale = DEFAULT_LOCALE, sign = false } = {}) {
  if (isBlank(value)) return EMPTY;

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return EMPTY;

  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(numeric);
}

export function formatCompact(value, { locale = DEFAULT_LOCALE } = {}) {
  if (isBlank(value)) return EMPTY;

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return EMPTY;

  return new Intl.NumberFormat(locale, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(numeric);
}

/**
 * A ratio as a percentage.
 *
 * The API returns raw decimals (0.3841), never pre-formatted percentages, so
 * the client owns presentation and the server owns the number.
 */
export function formatPercent(value, { decimals = 1, locale = DEFAULT_LOCALE, sign = false } = {}) {
  if (isBlank(value)) return EMPTY;

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return EMPTY;

  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: sign ? 'exceptZero' : 'auto',
  }).format(numeric);
}

/**
 * The difference between two ratios, in percentage POINTS.
 *
 * A margin moving 38.4% → 34.2% is "−4.2 pp", not "−4.2%". Mislabelling this is
 * a real reporting error and the reason this has its own function
 * (UI_UX_DIRECTION.md §3, METRICS.md §1.6).
 *
 * @param {number|null} value  a difference of two ratios, e.g. -0.042
 */
export function formatPoints(value, { decimals = 1, locale = DEFAULT_LOCALE } = {}) {
  if (isBlank(value)) return EMPTY;

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return EMPTY;

  const formatted = new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    signDisplay: 'exceptZero',
  }).format(numeric * 100);

  return `${formatted} pp`;
}

/* -------------------------------------------------------------------------- */
/* Dates                                                                       */
/* -------------------------------------------------------------------------- */

function toDate(value) {
  if (isBlank(value)) return null;

  const date = value instanceof Date ? value : new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, { locale = DEFAULT_LOCALE, timeZone } = {}) {
  const date = toDate(value);

  if (!date) return EMPTY;

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone,
  }).format(date);
}

export function formatDateTime(value, { locale = DEFAULT_LOCALE, timeZone } = {}) {
  const date = toDate(value);

  if (!date) return EMPTY;

  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
}

/** ISO calendar date (yyyy-mm-dd) — the form the API expects in filters. */
export function toIsoDate(value) {
  const date = toDate(value);

  if (!date) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function formatRelative(value, { locale = DEFAULT_LOCALE, now = new Date() } = {}) {
  const date = toDate(value);

  if (!date) return EMPTY;

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });

  const thresholds = [
    ['second', 60],
    ['minute', 60],
    ['hour', 24],
    ['day', 7],
    ['week', 4.35],
    ['month', 12],
  ];

  let amount = seconds;

  for (const [unit, step] of thresholds) {
    if (Math.abs(amount) < step) return formatter.format(Math.round(amount), unit);

    amount /= step;
  }

  return formatter.format(Math.round(amount), 'year');
}

/* -------------------------------------------------------------------------- */
/* Change direction                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Whether a change is good news, bad news, or neither.
 *
 * This is NOT the sign of the number. Expenses rising is unfavourable even
 * though the value grew; cancellation rate falling is favourable even though it
 * shrank. Each metric declares which direction is good, and this reads that
 * flag (UI_UX_DIRECTION.md §4, rule 1).
 *
 * @param {number|null} change            the signed change
 * @param {'up'|'down'} favourable        which direction is good for this metric
 * @returns {'positive'|'negative'|'neutral'}
 */
export function changeTone(change, favourable = 'up') {
  if (isBlank(change)) return 'neutral';

  const numeric = Number(change);

  if (!Number.isFinite(numeric) || numeric === 0) return 'neutral';

  const rising = numeric > 0;
  const good = favourable === 'up' ? rising : !rising;

  return good ? 'positive' : 'negative';
}

/**
 * The arrow accompanying a change.
 *
 * Colour is never the only signal — a colour-blind user, or a greyscale print,
 * must lose nothing (UI_UX_DIRECTION.md §4, rule 2).
 */
export function changeArrow(change) {
  if (isBlank(change)) return '';

  const numeric = Number(change);

  if (!Number.isFinite(numeric) || numeric === 0) return '±';

  return numeric > 0 ? '▲' : '▼';
}
