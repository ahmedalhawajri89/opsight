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

/*
 * Tinted fills with no outline. The outlined badges of the first design system
 * drew a ring around every status in a table, which turned a column of orders
 * into a column of boxes; a tint carries the tone with less noise, and the
 * text label still carries the meaning.
 */
const TONES = {
  neutral: 'text-(--color-text-2) bg-(--color-surface-hover)',
  accent: 'text-(--color-brand-text) bg-(--color-brand-soft)',
  positive: 'text-(--color-success) bg-(--color-success-soft)',
  negative: 'text-(--color-danger) bg-(--color-danger-soft)',
  warning: 'text-(--color-warning) bg-(--color-warning-soft)',
};

export function Badge({
  tone = 'neutral',
  dot = false,
  shape = 'pill',
  className,
  children,
  ...props
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5',
        // No class-merging helper exists, so the two shapes are exclusive here
        // rather than overridden by the caller.
        shape === 'tag' ? 'rounded-(--radius-control) px-2.5 py-1' : 'rounded-full px-2.5 py-1',
        'text-xs font-medium leading-4 whitespace-nowrap',
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
  cancelled: 'negative',
  refunded: 'warning',
};

export function OrderStatusBadge({ status, className }) {
  const { t } = useI18n();

  const known = Object.hasOwn(ORDER_STATUS_TONE, status);

  return (
    <Badge tone={known ? ORDER_STATUS_TONE[status] : 'neutral'} shape="pill" className={className}>
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
