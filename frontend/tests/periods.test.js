import { describe, expect, it } from 'vitest';

import {
  COMPARISON,
  PRESETS,
  describeComparison,
  formatBucketLabel,
  describePeriod,
  fiscalQuarterStart,
  fiscalYearStart,
  isPartialPeriod,
  periodLengthInDays,
  resolveComparison,
  resolvePreset,
} from '@/lib/periods';

// Local-calendar dates throughout: these are calendar dates, not instants.
const TODAY = new Date(2026, 8, 16); // 16 Sep 2026

describe('rolling presets', () => {
  it('includes today, so "last 7 days" is today plus the six before it', () => {
    expect(resolvePreset(PRESETS.Last7, { today: TODAY })).toEqual({
      from: '2026-09-10',
      to: '2026-09-16',
    });
  });

  it('resolves 30 and 90 day windows', () => {
    expect(resolvePreset(PRESETS.Last30, { today: TODAY }).from).toBe('2026-08-18');
    expect(resolvePreset(PRESETS.Last90, { today: TODAY }).from).toBe('2026-06-19');
  });

  it('starts month-to-date on the first of the month', () => {
    expect(resolvePreset(PRESETS.MonthToDate, { today: TODAY }).from).toBe('2026-09-01');
  });
});

/*
|--------------------------------------------------------------------------
| Fiscal year
|--------------------------------------------------------------------------
|
| A business whose fiscal year starts in July must not be shown a
| calendar-year YTD (METRICS.md §1.2).
|
*/

describe('fiscal year', () => {
  it('matches the calendar year when the fiscal year starts in January', () => {
    expect(fiscalYearStart(TODAY, 1)).toEqual(new Date(2026, 0, 1));
    expect(resolvePreset(PRESETS.YearToDate, { today: TODAY, fiscalStartMonth: 1 }).from).toBe(
      '2026-01-01',
    );
  });

  it('starts in the current year when today is on or after the fiscal start month', () => {
    // 16 Sep with a July start → this fiscal year began 1 Jul 2026.
    expect(resolvePreset(PRESETS.YearToDate, { today: TODAY, fiscalStartMonth: 7 }).from).toBe(
      '2026-07-01',
    );
  });

  it('starts in the PREVIOUS year when today is before the fiscal start month', () => {
    // 16 Sep with an October start → this fiscal year began 1 Oct 2025.
    expect(resolvePreset(PRESETS.YearToDate, { today: TODAY, fiscalStartMonth: 10 }).from).toBe(
      '2025-10-01',
    );
  });

  it('counts quarters from the fiscal year start, not from January', () => {
    // July start: Q1 = Jul–Sep, so 16 Sep sits in the quarter beginning 1 Jul.
    expect(fiscalQuarterStart(TODAY, 7)).toEqual(new Date(2026, 6, 1));
    // January start: 16 Sep sits in Q3, beginning 1 Jul.
    expect(fiscalQuarterStart(TODAY, 1)).toEqual(new Date(2026, 6, 1));
    // April start: Q1 = Apr–Jun, Q2 = Jul–Sep, so again 1 Jul.
    expect(fiscalQuarterStart(TODAY, 4)).toEqual(new Date(2026, 6, 1));
    // October start: 16 Sep is the last quarter of the PREVIOUS fiscal year.
    expect(fiscalQuarterStart(TODAY, 10)).toEqual(new Date(2026, 6, 1));
  });
});

/*
|--------------------------------------------------------------------------
| Period length and comparison
|--------------------------------------------------------------------------
*/

describe('periodLengthInDays', () => {
  it('is inclusive, so a single day has length 1', () => {
    expect(periodLengthInDays('2026-09-16', '2026-09-16')).toBe(1);
  });

  it('counts a full month correctly', () => {
    expect(periodLengthInDays('2026-08-01', '2026-08-31')).toBe(31);
  });

  it('handles a leap-year February', () => {
    expect(periodLengthInDays('2024-02-01', '2024-02-29')).toBe(29);
  });
});

describe('resolveComparison', () => {
  it('places the previous period immediately before, at equal length', () => {
    // August (31 days) compares against 1–31 July.
    expect(resolveComparison('2026-08-01', '2026-08-31', COMPARISON.PreviousPeriod)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
    });
  });

  it('does not overlap the current period', () => {
    const previous = resolveComparison('2026-09-10', '2026-09-16', COMPARISON.PreviousPeriod);

    expect(previous.to).toBe('2026-09-09');
    expect(periodLengthInDays(previous.from, previous.to)).toBe(7);
  });

  it('shifts by one calendar year for a year-on-year comparison', () => {
    expect(resolveComparison('2026-08-01', '2026-08-31', COMPARISON.PreviousYear)).toEqual({
      from: '2025-08-01',
      to: '2025-08-31',
    });
  });

  it('returns null when no comparison is requested', () => {
    expect(resolveComparison('2026-08-01', '2026-08-31', COMPARISON.None)).toBeNull();
  });

  it('spans a month boundary correctly', () => {
    expect(resolveComparison('2026-03-01', '2026-03-31', COMPARISON.PreviousPeriod)).toEqual({
      from: '2026-01-29',
      to: '2026-02-28',
    });
  });
});

/*
|--------------------------------------------------------------------------
| Partial periods
|--------------------------------------------------------------------------
|
| A period still accumulating must be badged, or a half-finished month gets
| read as a finished one (METRICS.md §1.2).
|
*/

describe('isPartialPeriod', () => {
  it('is true when the range reaches today', () => {
    expect(isPartialPeriod('2026-09-16', { today: TODAY })).toBe(true);
  });

  it('is true when the range extends past today', () => {
    expect(isPartialPeriod('2026-09-30', { today: TODAY })).toBe(true);
  });

  it('is false for a period that has fully elapsed', () => {
    expect(isPartialPeriod('2026-09-15', { today: TODAY })).toBe(false);
    expect(isPartialPeriod('2026-08-31', { today: TODAY })).toBe(false);
  });

  it('is false for a missing range rather than throwing', () => {
    expect(isPartialPeriod(null, { today: TODAY })).toBe(false);
  });
});

/*
|--------------------------------------------------------------------------
| Labels
|--------------------------------------------------------------------------
*/

describe('describePeriod', () => {
  it('omits a repeated year within one year', () => {
    expect(describePeriod('2026-08-01', '2026-08-31')).toBe('01 Aug – 31 Aug 2026');
  });

  it('shows both years when the range spans a year boundary', () => {
    expect(describePeriod('2025-12-20', '2026-01-10')).toBe('20 Dec 2025 – 10 Jan 2026');
  });
});

describe('describeComparison', () => {
  it('states the basis in words rather than leaving a bare percentage', () => {
    expect(describeComparison(COMPARISON.PreviousPeriod, '2026-09-10', '2026-09-16')).toBe(
      'vs previous 7 days',
    );
    expect(describeComparison(COMPARISON.PreviousYear, '2026-08-01', '2026-08-31')).toBe(
      'vs same period last year',
    );
  });

  it('says nothing when there is no comparison', () => {
    expect(describeComparison(COMPARISON.None, '2026-08-01', '2026-08-31')).toBe('');
  });
});

describe('formatBucketLabel', () => {
  it('labels a day or a week by its first day', () => {
    expect(formatBucketLabel('2026-09-07', '2026-09-07', { locale: 'en-GB' })).toBe('7 Sept');
    expect(formatBucketLabel('2026-09-07', '2026-09-13', { locale: 'en-GB' })).toBe('7 Sept');
  });

  it('labels a month by month and year', () => {
    expect(formatBucketLabel('2026-08-01', '2026-08-31', { locale: 'en-GB' })).toBe('Aug 2026');
  });

  it('writes Arabic month names in the chosen digits', () => {
    const label = formatBucketLabel('2026-09-07', '2026-09-07', { locale: 'ar-BH-u-nu-arab' });

    expect(label).toContain('٧');
    expect(label).not.toMatch(/[0-9]/);
  });
});
