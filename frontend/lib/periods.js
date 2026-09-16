/**
 * Period presets and comparison bases.
 *
 * The client resolves presets into calendar dates so the UI can label them; the
 * SERVER resolves those dates into instants in the business timezone and owns
 * every metric boundary (METRICS.md §1.2). This module must never be the place
 * a period is decided for calculation purposes — only for display and for the
 * `from`/`to` the client sends.
 *
 * All dates here are plain calendar dates (yyyy-mm-dd), never instants.
 */

import { DEFAULT_LOCALE, toIsoDate } from './format';

export const PRESETS = {
  Last7: '7d',
  Last30: '30d',
  Last90: '90d',
  MonthToDate: 'mtd',
  QuarterToDate: 'qtd',
  YearToDate: 'ytd',
  Custom: 'custom',
};

export const PRESET_LABELS = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  mtd: 'Month to date',
  qtd: 'Quarter to date',
  ytd: 'Year to date',
  custom: 'Custom range',
};

export const COMPARISON = {
  PreviousPeriod: 'previous_period',
  PreviousYear: 'previous_year',
  None: 'none',
};

export const COMPARISON_LABELS = {
  previous_period: 'Previous period',
  previous_year: 'Same period last year',
  none: 'No comparison',
};

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);

  return next;
}

/**
 * The start of the fiscal year containing `date`.
 *
 * A business whose fiscal year starts in July must not be shown a calendar-year
 * YTD. `fiscalStartMonth` is 1–12 and comes from business_settings.
 */
export function fiscalYearStart(date, fiscalStartMonth = 1) {
  const monthIndex = fiscalStartMonth - 1;
  const year = date.getMonth() >= monthIndex ? date.getFullYear() : date.getFullYear() - 1;

  return new Date(year, monthIndex, 1);
}

/**
 * The start of the fiscal quarter containing `date`.
 *
 * Quarters are counted from the fiscal year start, not from January, so a July
 * fiscal year has Q1 = Jul–Sep.
 */
export function fiscalQuarterStart(date, fiscalStartMonth = 1) {
  const yearStart = fiscalYearStart(date, fiscalStartMonth);
  const monthsElapsed =
    (date.getFullYear() - yearStart.getFullYear()) * 12 + (date.getMonth() - yearStart.getMonth());
  const quarterIndex = Math.floor(monthsElapsed / 3);

  return new Date(yearStart.getFullYear(), yearStart.getMonth() + quarterIndex * 3, 1);
}

/**
 * Resolve a preset into { from, to } calendar dates.
 *
 * Rolling presets are inclusive of today: "last 7 days" is today plus the six
 * before it, which is what an operator means by it.
 */
export function resolvePreset(preset, { today = new Date(), fiscalStartMonth = 1 } = {}) {
  const to = startOfDay(today);

  const from = (() => {
    switch (preset) {
      case PRESETS.Last7:
        return addDays(to, -6);
      case PRESETS.Last30:
        return addDays(to, -29);
      case PRESETS.Last90:
        return addDays(to, -89);
      case PRESETS.MonthToDate:
        return new Date(to.getFullYear(), to.getMonth(), 1);
      case PRESETS.QuarterToDate:
        return fiscalQuarterStart(to, fiscalStartMonth);
      case PRESETS.YearToDate:
        return fiscalYearStart(to, fiscalStartMonth);
      default:
        return addDays(to, -29);
    }
  })();

  return { from: toIsoDate(from), to: toIsoDate(to) };
}

/** Inclusive day count, so a single-day period has length 1. */
export function periodLengthInDays(from, to) {
  const start = startOfDay(new Date(from));
  const end = startOfDay(new Date(to));
  const msPerDay = 24 * 60 * 60 * 1000;

  return Math.round((end - start) / msPerDay) + 1;
}

/**
 * The comparison range for a period.
 *
 * `previous_period` is the equal-length range ending the day before `from` —
 * the default, because "is this better than recently?" is the question an
 * operator actually asks. `previous_year` shifts by one calendar year, which
 * seasonal businesses need and for which a previous-period comparison misleads.
 */
export function resolveComparison(from, to, basis = COMPARISON.PreviousPeriod) {
  if (basis === COMPARISON.None) return null;

  const start = startOfDay(new Date(from));
  const end = startOfDay(new Date(to));

  if (basis === COMPARISON.PreviousYear) {
    const shift = (date) => new Date(date.getFullYear() - 1, date.getMonth(), date.getDate());

    return { from: toIsoDate(shift(start)), to: toIsoDate(shift(end)) };
  }

  const length = periodLengthInDays(from, to);
  const previousTo = addDays(start, -1);
  const previousFrom = addDays(previousTo, -(length - 1));

  return { from: toIsoDate(previousFrom), to: toIsoDate(previousTo) };
}

/**
 * True when the range extends to today or beyond — the period is still
 * accumulating, so any conclusion drawn from it is provisional.
 *
 * The UI badges such a period "Incomplete" rather than letting a half-finished
 * month be read as a finished one (METRICS.md §1.2).
 */
export function isPartialPeriod(to, { today = new Date() } = {}) {
  if (!to) return false;

  return startOfDay(new Date(to)) >= startOfDay(today);
}

/** Human label for a resolved range, used in headers and comparison captions. */
export function describePeriod(from, to, { locale = DEFAULT_LOCALE } = {}) {
  if (!from || !to) return '';

  const start = new Date(from);
  const end = new Date(to);
  const sameYear = start.getFullYear() === end.getFullYear();

  const startLabel = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(start);

  const endLabel = new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(end);

  return `${startLabel} – ${endLabel}`;
}

/**
 * The phrase a comparison is described with on screen.
 *
 * A bare percentage with no stated basis is not a comparison, it is a rumour —
 * every KPI tile says what it is comparing against (UI_UX_DIRECTION.md §6).
 */
export function describeComparison(basis, from, to) {
  if (basis === COMPARISON.None || !from || !to) return '';

  if (basis === COMPARISON.PreviousYear) return 'vs same period last year';

  const days = periodLengthInDays(from, to);

  return `vs previous ${days} days`;
}
