'use client';

import { cn } from '@/lib/cn';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Status and label badges.
 *
 * Every badge carries a text label. A bare coloured dot is never enough — a
 * colour-blind user, a greyscale print and a screenshot in a report all lose
 * the meaning (UI_UX_DIRECTION.md §6).
 */

const TONES = {
  neutral: 'text-(--color-text-muted) border-(--color-line-strong) bg-(--color-surface)',
  accent: 'text-(--color-accent-text) border-(--color-accent) bg-(--color-accent-subtle)',
  positive: 'text-(--color-positive) border-(--color-positive) bg-(--color-positive-subtle)',
  negative: 'text-(--color-negative) border-(--color-negative) bg-(--color-negative-subtle)',
  warning: 'text-(--color-warning) border-(--color-warning) bg-(--color-warning-subtle)',
};

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5',
        'text-[0.6875rem] font-medium leading-4 whitespace-nowrap',
        TONES[tone] ?? TONES.neutral,
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />}
      {children}
    </span>
  );
}

/**
 * Order status, rendered consistently everywhere it appears.
 *
 * The mapping lives here rather than in each screen, so a status can never be
 * styled two different ways in two places. Statuses mirror the backend state
 * machine exactly (MVP_SCOPE.md §6.3).
 */
const ORDER_STATUS_TONE = {
  draft: 'neutral',
  confirmed: 'accent',
  fulfilled: 'positive',
  cancelled: 'neutral',
  refunded: 'warning',
};

export function OrderStatusBadge({ status, className }) {
  const { t } = useI18n();

  const known = Object.hasOwn(ORDER_STATUS_TONE, status);

  return (
    <Badge tone={known ? ORDER_STATUS_TONE[status] : 'neutral'} dot className={className}>
      {known ? t(`orderStatus.${status}`) : (status ?? t('common.unknown'))}
    </Badge>
  );
}

/**
 * Marks a period that is still accumulating.
 *
 * Without this a half-finished month reads as a finished one, and every
 * comparison drawn from it is wrong by omission (METRICS.md §1.2).
 */
export function PartialBadge({ className }) {
  const { t } = useI18n();

  return (
    <Badge tone="warning" className={className} title={t('period.inProgressTitle')}>
      {t('period.incomplete')}
    </Badge>
  );
}
