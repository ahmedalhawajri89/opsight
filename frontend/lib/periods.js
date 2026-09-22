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

import { getFormatLocale, toIsoDate } from './format';

// Labels for these values live in the dictionaries (period.presets / period.comparisons).
export const PRESETS = {
  Last7: '7d',
  Last30: '30d',
  Last90: '90d',
  Last365: '365d',
  MonthToDate: 'mtd',
  QuarterToDate: 'qtd',
  YearToDate: 'ytd',
  Custom: 'custom',
};

// The length of each rolling preset, passed to its label as `{count}` so the
// number is written in the reader's digits rather than baked into a sentence.
export const PRESET_DAYS = {
  [PRESETS.Last7]: 7,
  [PRESETS.Last30]: 30,
  [PRESETS.Last90]: 90,
  [PRESETS.Last365]: 365,
};

// What each rolling preset's label counts: days, except a year, which reads as
// "last 12 months" rather than "last 365 days".
export const PRESET_LABEL_COUNTS = {
  [PRESETS.Last7]: 7,
  [PRESETS.Last30]: 30,
  [PRESETS.Last90]: 90,
  [PRESETS.Last365]: 12,
};

export const COMPARISON = {
  PreviousPeriod: 'previous_period',
  PreviousYear: 'previous_year',
  // Ramadan against Ramadan: the same Hijri dates a Hijri year earlier.
  PreviousHijriYear: 'previous_hijri_year',
  None: 'none',
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
      case PRESETS.Last365:
        return addDays(to, -364);
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
  /*
   * The Hijri basis is resolved on the server alone (Umm al-Qura through
   * ICU), and the screen shows the range the server reports in
   * `meta.comparison`. A second, JavaScript implementation of the Hijri
   * calendar here could only ever disagree with it.
   */
  if (basis === COMPARISON.None || basis === COMPARISON.PreviousHijriYear) return null;

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
export function describePeriod(from, to, { locale = getFormatLocale() } = {}) {
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
  if (basis === COMPARISON.PreviousHijriYear) return 'vs the same Hijri dates last year';

  const days = periodLengthInDays(from, to);

  return `vs previous ${days} days`;
}

/**
 * The on-screen label of one time-series bucket, in the reader's language and
 * digits.
 *
 * The API also sends a `label`, but it is written for a CSV and a log line —
 * English month abbreviations with Western digits. The grain is read from the
 * bucket's own span rather than passed in, so every caller of a series gets
 * the right label without having to know how it was requested.
 */
export function formatBucketLabel(bucket, bucketEnd, { locale = getFormatLocale() } = {}) {
  if (!bucket) return '';

  const start = new Date(`${bucket}T00:00:00Z`);
  const span = bucketEnd ? (new Date(`${bucketEnd}T00:00:00Z`) - start) / 86_400_000 : 0;
  const monthly = span >= 27;

  return new Intl.DateTimeFormat(locale, {
    timeZone: 'UTC',
    ...(monthly ? { month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }),
  }).format(start);
}

/** A month bucket as its short month name alone ("Aug", "أغسطس"), for a bar axis. */
export function formatMonthLabel(bucket, { locale = getFormatLocale() } = {}) {
  if (!bucket) return '';

  return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', month: 'short' }).format(
    new Date(`${bucket}T00:00:00Z`),
  );
}

/**
 * Whether a DAILY bucket falls on one of the business's days off.
 *
 * `weekendDays` are ISO days (1 = Monday … 7 = Sunday), from the server's
 * settings — Friday and Saturday across most of the Gulf, not the Saturday
 * and Sunday a Western default would assume (ADR-020). A weekly or monthly
 * bucket is never a weekend: only a single day can be.
 */
export function isWeekendBucket(bucket, bucketEnd, weekendDays = []) {
  if (!bucket || (bucketEnd && bucketEnd !== bucket) || weekendDays.length === 0) return false;

  const day = new Date(`${bucket}T00:00:00Z`).getUTCDay();

  return weekendDays.includes(day === 0 ? 7 : day);
}

/**
 * Consecutive weekend days in a DAILY series, as bands a chart can shade.
 *
 * A chart drawn as connected points places each day on a single x position, so
 * a band from a day to itself has no width and draws nothing. Runs of adjacent
 * weekend days become one band from the first to the last; a lone day off is
 * widened to the day after it (or before it, at the end of the series) so the
 * band is visible. Returns indices into `series`.
 */
export function weekendRuns(series, weekendDays = []) {
  const runs = [];
  let start = null;

  series.forEach((bucket, index) => {
    const off = isWeekendBucket(bucket.bucket, bucket.bucket_end, weekendDays);

    if (off && start === null) start = index;

    if (!off && start !== null) {
      runs.push([start, index - 1]);
      start = null;
    }
  });

  if (start !== null) runs.push([start, series.length - 1]);

  return runs.map(([from, to]) => {
    if (from !== to) return [from, to];

    return to + 1 < series.length ? [from, to + 1] : [Math.max(0, from - 1), to];
  });
}
