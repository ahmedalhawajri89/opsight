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
 * The direction a formatted figure must be laid out in.
 *
 * Digits, signs, "%" and date separators are direction-NEUTRAL, so inside a
 * right-to-left page they take the page's direction and reorder: "-80.1%"
 * displays as "80.1%-" and "+0.7 pp" as "pp 0.7+". For a financial figure that
 * is not cosmetic — the sign moves to the other end of the number. A figure
 * formatted with Latin digits is therefore isolated as left-to-right; one
 * formatted for an Arabic-script locale already carries its own direction
 * marks from Intl and is left to them.
 *
 * Use with <bdi dir={figureDirection(text)}>.
 */
export function figureDirection(text) {
  return /[\u0600-\u06FF]/.test(String(text ?? '')) ? undefined : 'ltr';
}

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
 * Money split into its currency and its amount, for typography only.
 *
 * A KPI reads the amount; the currency is the same on every figure in the
 * installation, so it can be set smaller and quieter without losing anything.
 * The split comes from the SAME Intl formatter as `formatMoney` via
 * `formatToParts`, so the digits rendered are exactly the digits that function
 * would produce — this is not a second money formatter.
 *
 * Whether the currency leads or trails is the LOCALE's decision, not this
 * function's: `en-GB` puts it first, several Arabic locales put it last, and
 * `position` carries that through so a caller never hardcodes an order.
 *
 * @returns {{ currency: string, amount: string, position: 'before'|'after' }|null}
 *          null for a blank value, which the caller renders as an em dash.
 */
export function formatMoneyParts(
  value,
  { currency = 'BHD', decimals = 3, locale = DEFAULT_LOCALE } = {},
) {
  if (isBlank(value)) return null;

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return null;

  const parts = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).formatToParts(numeric);

  const currencyIndex = parts.findIndex((part) => part.type === 'currency');
  const firstDigit = parts.findIndex((part) => part.type === 'integer');

  return {
    currency: currencyIndex === -1 ? '' : parts[currencyIndex].value,
    amount: parts
      .filter((part) => part.type !== 'currency' && part.type !== 'literal')
      .map((part) => part.value)
      .join(''),
    position: currencyIndex !== -1 && currencyIndex > firstDigit ? 'after' : 'before',
  };
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
