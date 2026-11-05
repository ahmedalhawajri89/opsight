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
 * @param {'md'|'lg'} size  `lg` is the front door's, where the mark is the
 *   first thing on the card; everywhere else it is a sidebar's.
 */
export function Logo({ compact = false, tone = 'brand', size = 'md' }) {
  const { t } = useI18n();
  const colours = TONES[tone] ?? TONES.brand;

  return (
    <span className={cn('flex items-center gap-2.5', colours.mark)}>
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        width={size === 'lg' ? 44 : 30}
        height={size === 'lg' ? 44 : 30}
        fill="none"
        focusable="false"
      >
        {/*
          An open shape, not a ring.

          The first mark put a ring, a line and three bars inside 32 units,
          and at the 30px it is actually drawn at they closed into a dark
          blob. What is left is the gathered yield alone — a floor swept to
          a level, the line where the wind took the chaff above it, and one
          grain still in the air so the line reads as sorting rather than as
          a rim.

          Two attempts in between were made against the wrong evidence: the
          selector taking the screenshot was grabbing the language button’s
          globe instead of this, so the mark was redrawn twice to fix a fault
          it never had. The lesson is in the method, not the shape — crop a
          mark by what it IS, never by what comes first on the page.
        */}
        <path d="M28.6 18.6 A12.6 12.6 0 0 1 3.4 18.6 Z" fill="currentColor" />

        <path
          d="M3.4 18.6h25.2"
          stroke="var(--color-accent-on-brand, currentColor)"
          strokeWidth="2.8"
          strokeLinecap="round"
        />

        {/* One grain still in the air, so the line reads as sorting. */}
        <circle cx="21.5" cy="11.5" r="1.9" fill="currentColor" opacity="0.55" />
      </svg>

      {!compact && (
        <span
          className={cn(
            'font-bold tracking-tight',
            size === 'lg' ? 'text-3xl' : 'text-xl',
            colours.word,
          )}
        >
          {t('common.appName')}
        </span>
      )}
    </span>
  );
}
