'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';

/**
 * The product mark and wordmark.
 *
 * THE FLOOR, THE WIND LINE, THE GRAIN. A بيدر is the round floor where a
 * harvest is gathered, the grain separated from the chaff, and the yield
 * weighed and counted — which is what this product does to a month of
 * trading. So the mark is that floor seen from above: a ring, a line across
 * it where the wind takes the chaff, and beneath it the grain standing in a
 * measure that is also a bar chart. The last bar carries the accent because
 * it is now.
 *
 * It replaced a mark drawn around the Latin letter O, which was the first
 * letter of a name this product no longer has.
 *
 * A STROKE, NOT A FILL, AND NO GRADIENT. One weight, one path set: it
 * survives at 18px in a taskbar, which is where it spends most of its life
 * once the application is installed, and it can be printed in a single
 * colour or embroidered without turning to mud.
 *
 * `currentColor`, so the mark takes the colour of whatever it sits on —
 * ink on the light sidebar, white on the sign-in panel — without a second
 * set of tokens to keep in step. The one exception is the grain's accent,
 * which carries meaning rather than decoration and so is named.
 */
const TONES = {
  /** On a light surface: the mark in link blue, the name in ink. */
  brand: { mark: 'text-(--color-brand-text)', word: 'text-(--color-text)' },

  /** On the sign-in panel's brand wash, where both must be light. */
  onBrand: { mark: 'text-(--color-on-brand)', word: 'text-(--color-on-brand)' },
};

/**
 * @param {boolean} compact  The mark alone, without the name.
 * @param {'brand'|'onBrand'} tone  Which ground it is standing on.
 */
export function Logo({ compact = false, tone = 'brand' }) {
  const { t } = useI18n();
  const colours = TONES[tone] ?? TONES.brand;

  return (
    <span className={cn('flex items-center gap-2.5', colours.mark)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        width="30"
        height="30"
        fill="none"
        focusable="false"
      >
        {/* The floor, seen from above. */}
        <circle cx="16" cy="16" r="13.2" stroke="currentColor" strokeWidth="2.4" />

        {/*
          The wind line, where the chaff goes. It is the one element that
          keeps its own colour at every size: below about 20px the bars close
          up into a block and this line is what still reads as sorting rather
          than as a filled circle.
        */}
        <path
          d="M6.4 17.4h19.2"
          stroke="var(--color-accent-on-brand, currentColor)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />

        {/* The grain beneath it, counted — a measure that is also a figure. */}
        <rect x="9.6" y="19.8" width="3" height="4.2" rx="1.1" fill="currentColor" />
        <rect x="14.5" y="18.4" width="3" height="5.6" rx="1.1" fill="currentColor" />
        <rect x="19.4" y="21" width="3" height="3" rx="1.1" fill="currentColor" />
      </svg>

      {!compact && (
        <span className={cn('text-xl font-bold tracking-tight', colours.word)}>
          {t('common.appName')}
        </span>
      )}
    </span>
  );
}
