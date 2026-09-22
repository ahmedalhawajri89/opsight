import { describe, expect, it } from 'vitest';

import {
  EMPTY,
  changeArrow,
  changeTone,
  formatCompact,
  formatDate,
  formatDateTime,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatPoints,
  formatRelative,
  setMoneyDefaults,
  toIsoDate,
} from '@/lib/format';

/*
|--------------------------------------------------------------------------
| null is not zero
|--------------------------------------------------------------------------
|
| The most important behaviour in this module. A metric with no value must
| render as an em dash — never 0, NaN, Infinity or a blank (METRICS.md §1.5).
|
*/

describe('absent values', () => {
  const formatters = {
    formatMoney,
    formatNumber,
    formatCompact,
    formatPercent,
    formatPoints,
    formatDate,
    formatDateTime,
    formatRelative,
  };

  for (const [name, fn] of Object.entries(formatters)) {
    it(`${name} renders null as an em dash`, () => {
      expect(fn(null)).toBe(EMPTY);
      expect(fn(undefined)).toBe(EMPTY);
      expect(fn('')).toBe(EMPTY);
    });
  }

  it('never renders a non-finite number as Infinity or NaN', () => {
    expect(formatNumber(Infinity)).toBe(EMPTY);
    expect(formatNumber(-Infinity)).toBe(EMPTY);
    expect(formatNumber(NaN)).toBe(EMPTY);
    expect(formatPercent(Infinity)).toBe(EMPTY);
    expect(formatMoney('not-a-number')).toBe(EMPTY);
  });

  it('renders a real zero as zero, because zero revenue is a fact', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatMoney('0', { currency: 'BHD', decimals: 3 })).toContain('0.000');
    expect(formatPercent(0)).toBe('0.0%');
  });
});

/*
|--------------------------------------------------------------------------
| Money
|--------------------------------------------------------------------------
*/

describe('formatMoney', () => {
  it('formats a decimal string without converting it to a float for arithmetic', () => {
    // The API sends strings; 0.1 + 0.2 is why (ADR-015).
    expect(formatMoney('48210.50', { currency: 'BHD', decimals: 3 })).toContain('48,210.500');
  });

  it('honours the currency decimals from business settings', () => {
    expect(formatMoney('10', { currency: 'BHD', decimals: 3 })).toContain('10.000');
    expect(formatMoney('10', { currency: 'USD', decimals: 2 })).toContain('10.00');
  });

  it('renders negative money correctly rather than clamping at zero', () => {
    // Net revenue can be negative when refunds exceed sales in a period.
    expect(formatMoney('-500.25', { currency: 'USD', decimals: 2 })).toMatch(/-|\(/);
  });

  it('shows an explicit sign when asked, but not for zero', () => {
    expect(formatMoney('12', { currency: 'USD', decimals: 2, sign: true })).toContain('+');
    expect(formatMoney('0', { currency: 'USD', decimals: 2, sign: true })).not.toContain('+');
  });

  it('does not lose precision on a large value', () => {
    expect(formatMoney('1234567.891', { currency: 'BHD', decimals: 3 })).toContain('1,234,567.891');
  });
});

/*
|--------------------------------------------------------------------------
| Percentages vs percentage points
|--------------------------------------------------------------------------
*/

describe('the business currency (ADR-023)', () => {
  it('formats every amount in the business currency and places once it is set', () => {
    try {
      setMoneyDefaults({ currency: 'KWD', decimals: 3 });
      expect(formatMoney('12.5', { locale: 'en-GB' })).toContain('KWD');
      expect(formatMoney('12.5', { locale: 'en-GB' })).toContain('12.500');
      expect(formatMoneyCompact('12500', { locale: 'en-GB' })).toContain('KWD');

      setMoneyDefaults({ currency: 'SAR', decimals: 2 });
      expect(formatMoney('12.5', { locale: 'en-GB' })).toContain('SAR');
      expect(formatMoney('12.5', { locale: 'en-GB' })).toContain('12.50');
      expect(formatMoney('12.5', { locale: 'en-GB' })).not.toContain('12.500');
    } finally {
      setMoneyDefaults({ currency: 'BHD', decimals: 3 });
    }
  });

  it('still lets a caller name the currency explicitly', () => {
    try {
      setMoneyDefaults({ currency: 'KWD', decimals: 3 });
      expect(formatMoney('1', { currency: 'AED', decimals: 2, locale: 'en-GB' })).toContain('AED');
    } finally {
      setMoneyDefaults({ currency: 'BHD', decimals: 3 });
    }
  });
});

describe('formatPercent and formatPoints', () => {
  it('formats a raw ratio as a percentage', () => {
    expect(formatPercent(0.3841)).toBe('38.4%');
  });

  it('labels a difference of two ratios as pp, not %', () => {
    // 38.4% → 34.2% is "−4.2 pp". Calling it "−4.2%" is a reporting error.
    expect(formatPoints(-0.042)).toBe('-4.2 pp');
  });

  it('always signs a points value, including positives', () => {
    expect(formatPoints(0.031)).toBe('+3.1 pp');
  });

  it('does not sign a zero-point change', () => {
    expect(formatPoints(0)).toBe('0.0 pp');
  });
});

/*
|--------------------------------------------------------------------------
| Favourable direction — not the sign of the number
|--------------------------------------------------------------------------
*/

describe('changeTone', () => {
  it('treats a rise as good for a metric where up is good', () => {
    expect(changeTone(0.09, 'up')).toBe('positive');
    expect(changeTone(-0.09, 'up')).toBe('negative');
  });

  it('treats a rise as BAD for a metric where down is good', () => {
    // Expenses rising is unfavourable even though the number grew.
    expect(changeTone(0.4, 'down')).toBe('negative');
    // Cancellation rate falling is favourable even though it shrank.
    expect(changeTone(-0.05, 'down')).toBe('positive');
  });

  it('is neutral for no change and for an absent comparison', () => {
    expect(changeTone(0, 'up')).toBe('neutral');
    expect(changeTone(null, 'up')).toBe('neutral');
    expect(changeTone(undefined, 'down')).toBe('neutral');
  });
});

describe('changeArrow', () => {
  it('pairs every colour with a shape so colour is never the only signal', () => {
    expect(changeArrow(1)).toBe('▲');
    expect(changeArrow(-1)).toBe('▼');
    expect(changeArrow(0)).toBe('±');
    expect(changeArrow(null)).toBe('');
  });
});

/*
|--------------------------------------------------------------------------
| Dates
|--------------------------------------------------------------------------
*/

describe('dates', () => {
  it('formats an ISO timestamp', () => {
    expect(formatDate('2026-08-31T12:00:00Z', { timeZone: 'UTC' })).toBe('31 Aug 2026');
  });

  it('uses a 24-hour clock', () => {
    expect(formatDateTime('2026-08-31T18:30:00Z', { timeZone: 'UTC' })).toContain('18:30');
  });

  it('produces the yyyy-mm-dd the API expects, in local calendar terms', () => {
    expect(toIsoDate(new Date(2026, 7, 31))).toBe('2026-08-31');
    expect(toIsoDate(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('returns null rather than a bogus date for unparseable input', () => {
    expect(toIsoDate('nonsense')).toBeNull();
    expect(formatDate('nonsense')).toBe(EMPTY);
  });

  it('describes recent instants relatively', () => {
    const now = new Date('2026-09-16T12:00:00Z');

    expect(formatRelative('2026-09-16T11:00:00Z', { now })).toContain('hour');
    expect(formatRelative('2026-09-14T12:00:00Z', { now })).toContain('day');
  });
});
