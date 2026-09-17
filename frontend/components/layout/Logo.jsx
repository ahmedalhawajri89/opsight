'use client';

import { useId } from 'react';

import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * The product mark and wordmark.
 *
 * A drop with a lens cut through it — "sight" into the flow of operations. The
 * only gradient in the interface, and it is identity, not decoration.
 */
export function Logo({ compact = false }) {
  const { t } = useI18n();
  const gradient = useId();

  return (
    <span className="flex items-center gap-2.5">
      <svg aria-hidden="true" viewBox="0 0 32 32" width="30" height="30" focusable="false">
        <defs>
          <linearGradient
            id={gradient}
            x1="4"
            y1="2"
            x2="28"
            y2="30"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0" stopColor="var(--brand-from)" />
            <stop offset="1" stopColor="var(--brand-to)" />
          </linearGradient>
        </defs>
        <path
          d="M16 2.5c5.8 6.3 10.5 12 10.5 17.5a10.5 10.5 0 0 1-21 0C5.5 14.5 10.2 8.8 16 2.5Z"
          fill={`url(#${gradient})`}
        />
        <circle cx="16" cy="19.5" r="4.25" fill="none" stroke="#fff" strokeWidth="2.4" />
      </svg>
      {!compact && (
        <span className="text-xl font-bold tracking-tight text-(--color-text)">
          {t('common.appName')}
        </span>
      )}
    </span>
  );
}
