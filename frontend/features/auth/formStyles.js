/**
 * The look of the fields on the sign-in and sign-up screens, shared so the two
 * forms cannot drift apart. Larger than the in-app controls (h-11): these are
 * the first fields anyone meets, often on a phone.
 */
export const FIELD =
  'h-11 w-full rounded-(--radius-control) border bg-(--color-surface) px-4 text-base text-(--color-text) transition-colors duration-(--duration-fast) placeholder:text-(--color-muted)';

export const LABEL = 'block text-sm font-medium text-(--color-text)';

export const MESSAGE = 'mt-2 text-sm text-(--color-danger)';

export const SUBMIT =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-(--radius-control) bg-(--color-brand) px-4 text-base font-semibold text-(--color-text-inverse) transition-colors duration-(--duration-fast) hover:bg-(--color-brand-hover) disabled:opacity-60';
