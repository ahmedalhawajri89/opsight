'use client';

import { EMPTY, formatMoneyParts } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * A sum of money set as the dashboard sets it: the amount carries the weight,
 * the currency sits beside it smaller and quieter.
 *
 * The split is formatMoneyParts', from the same Intl formatter as formatMoney,
 * so the digits are the ones every other screen prints. The locale decides
 * whether the currency leads or trails.
 */
export function Amount({ value, currency, decimals, className, currencyClassName }) {
  const parts = formatMoneyParts(value, { currency, decimals });

  if (parts === null) return <span className={className}>{EMPTY}</span>;

  const unit = (
    <span className={cn('font-medium opacity-75', currencyClassName ?? 'text-[0.45em]')}>
      {parts.currency}
    </span>
  );

  return (
    <span className={cn('tabular inline-flex items-baseline gap-[0.25em]', className)}>
      {parts.position === 'before' && unit}
      <bdi dir="ltr">{parts.amount}</bdi>
      {parts.position === 'after' && unit}
    </span>
  );
}
