'use client';

import { forwardRef } from 'react';

import { cn } from '@/lib/cn';

/**
 * Four variants, three sizes. Every one uses tokens — no component in this
 * project hard-codes a colour.
 *
 * `danger` exists for actions that reverse recognised revenue or move stock.
 * It is deliberately not the same red as an error message: this is a control,
 * not a status.
 */
const VARIANTS = {
  primary:
    'bg-(--color-accent) text-(--color-text-inverse) hover:bg-(--color-accent-hover) active:bg-(--color-accent-active) border border-transparent',
  secondary:
    'bg-(--color-surface) text-(--color-text) border border-(--color-line-strong) hover:bg-(--color-surface-hover)',
  ghost:
    'bg-transparent text-(--color-text-muted) border border-transparent hover:bg-(--color-surface-hover) hover:text-(--color-text)',
  danger:
    'bg-(--color-surface) text-(--color-negative) border border-(--color-negative) hover:bg-(--color-negative-subtle)',
};

const SIZES = {
  sm: 'h-7 px-2 text-[0.8125rem] gap-1.5',
  md: 'h-8 px-3 text-sm gap-2',
  lg: 'h-10 px-4 text-sm gap-2',
};

export const Button = forwardRef(function Button(
  {
    variant = 'secondary',
    size = 'md',
    type = 'button',
    loading = false,
    disabled = false,
    className,
    children,
    ...props
  },
  ref,
) {
  const isDisabled = disabled || loading;

  return (
    <button
      ref={ref}
      type={type}
      disabled={isDisabled}
      // Announced to assistive technology rather than only shown visually.
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex select-none items-center justify-center rounded-(--radius-sm) font-medium',
        'transition-colors duration-150',
        'disabled:cursor-not-allowed disabled:opacity-55',
        VARIANTS[variant] ?? VARIANTS.secondary,
        SIZES[size] ?? SIZES.md,
        className,
      )}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

/**
 * The only spinner in the project, and it appears only inside a button while a
 * request is in flight. Loading *content* uses skeletons, because a centred
 * spinner guarantees a layout shift when the real thing arrives.
 */
function Spinner() {
  return (
    <svg
      className="size-3.5 animate-spin"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path
        d="M14.5 8A6.5 6.5 0 0 0 8 1.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
