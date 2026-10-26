'use client';

import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * The product mark and wordmark.
 *
 * THE O THAT MEASURES. The initial, drawn as a single open stroke, cut at the
 * top right where a figure rises out of it. The name is the idea — operations
 * and sight — and the letter is the only part of it that could not belong to
 * another product. An eye or a lens would read faster to a stranger and would
 * be one of a hundred: every monitoring tool on the market has one.
 *
 * A STROKE, NOT A FILL, AND NO GRADIENT. The mark it replaced was the only
 * gradient in the interface, which made it the one element that could not be
 * printed in a single colour, embroidered, or reduced to a 16px favicon
 * without turning to mud. This is one path at one weight: it survives at
 * 18px in a taskbar, which is where it will spend most of its life once the
 * application is installed.
 *
 * `currentColor`, so the mark takes the colour of whatever it sits on — navy
 * on the light sidebar, the pale brand blue in dark mode — without a second
 * set of tokens to keep in step.
 */
export function Logo({ compact = false }) {
  const { t } = useI18n();

  return (
    <span className="flex items-center gap-2.5 text-(--color-brand-text)">
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        width="30"
        height="30"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {/* The O, open where the figure leaves it. */}
        <path d="M22.4 6.2A11.6 11.6 0 1 0 27 14.3" />
        {/* The figure: three steps up and out through the gap. */}
        <path d="m19.6 16.6 4-4.6 3.1 2.6 3.6-6.1" />
      </svg>

      {!compact && (
        <span className="text-xl font-bold tracking-tight text-(--color-text)">
          {t('common.appName')}
        </span>
      )}
    </span>
  );
}
