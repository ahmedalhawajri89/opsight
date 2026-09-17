'use client';

import { cn } from '@/lib/cn';
import {
  EMPTY,
  changeArrow,
  changeTone,
  figureDirection,
  formatPercent,
  formatPoints,
} from '@/lib/format';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * A period-over-period change.
 *
 * Three rules, all of which exist because the obvious implementation is wrong:
 *
 * 1. **Tone follows the metric's favourable direction, not the sign.** Expenses
 *    rising is bad news even though the number grew. Every caller passes
 *    `favourable`.
 *
 * 2. **Colour is never the only signal.** An arrow and a sign accompany it, so
 *    nothing is lost in greyscale or to a colour-blind reader.
 *
 * 3. **A null change renders as an em dash with an explanation**, never as 0%.
 *    A percentage against a zero or sign-flipped base is not computable, and
 *    inventing one is the failure this whole product exists to avoid
 *    (METRICS.md §1.5).
 */

const TONE_CLASSES = {
  positive: 'text-(--color-positive)',
  negative: 'text-(--color-negative)',
  neutral: 'text-(--color-text-muted)',
};

/*
 * The chip variant puts the change on a tinted ground so it can be found at a
 * glance in a KPI band. The tint REPEATS the meaning of the arrow and sign; it
 * never replaces them.
 */
const CHIP_CLASSES = {
  positive: 'bg-(--color-positive-subtle) text-(--color-positive)',
  negative: 'bg-(--color-negative-subtle) text-(--color-negative)',
  neutral: 'bg-(--color-surface-hover) text-(--color-text-muted)',
};

export function ComparisonValue({
  change,
  /** 'percent' for a ratio change, 'points' for a difference of two ratios. */
  format = 'percent',
  favourable = 'up',
  basis,
  previousLabel,
  /** 'inline' (default) or 'chip'. */
  variant = 'inline',
  className,
}) {
  const { t } = useI18n();
  const tone = changeTone(change, favourable);
  const unavailable = change === null || change === undefined;

  const formatted = unavailable
    ? EMPTY
    : format === 'points'
      ? formatPoints(change)
      : formatPercent(change, { sign: true });

  return (
    <div
      className={cn('flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[0.8125rem]', className)}
    >
      <span
        // The tone as data, so a test asserts WHAT the change means rather than
        // how a stylesheet happens to spell it. The class-based assertions this
        // replaced kept passing through a whole release in which the class
        // compiled to invalid CSS and no colour ever reached the screen.
        data-tone={tone}
        className={cn(
          'tabular inline-flex items-baseline gap-1 font-medium',
          variant === 'chip'
            ? cn('rounded-(--radius-sm) px-1.5 py-px text-xs', CHIP_CLASSES[tone])
            : TONE_CLASSES[tone],
        )}
        title={unavailable ? t('comparison.unavailable') : undefined}
      >
        {!unavailable && (
          <span aria-hidden="true" className="text-[0.625rem]">
            {changeArrow(change)}
          </span>
        )}
        <bdi dir={figureDirection(formatted)}>{formatted}</bdi>
      </span>

      {/* The basis is always stated in words. A bare percentage is a rumour. */}
      {basis && <span className="text-(--color-text-subtle)">{basis}</span>}

      {previousLabel && (
        <bdi dir={figureDirection(previousLabel)} className="tabular text-(--color-text-subtle)">
          {previousLabel}
        </bdi>
      )}
    </div>
  );
}
