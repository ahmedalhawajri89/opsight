/**
 * The look of the fields on the sign-in and sign-up screens, shared so the two
 * forms cannot drift apart. Larger than the in-app controls (h-11): these are
 * the first fields anyone meets, often on a phone.
 *
 * THESE SIT ON INK. The sign-in page is one field of brand ink with the form
 * standing in the middle of it (AuthLayout), so everything a reader looks AT
 * — the label, the hint under a checkbox, the rule between sections — takes
 * the on-brand tokens rather than the page's text colours, which are tuned
 * for the light ground of the application itself.
 *
 * THE INPUT ITSELF STAYS LIGHT, AND THAT IS NOT AN OVERSIGHT. A browser
 * paints its own background into a field it has autofilled, and no stylesheet
 * on the page can override it. A transparent input on ink therefore looks
 * correct until a password manager fills it and then turns into a pale
 * rectangle sitting in the dark. Keeping the field light means the autofill
 * colour lands on a light field, where it belongs.
 */
export const FIELD =
  'h-11 w-full rounded-(--radius-control) border bg-(--color-surface) px-4 text-base text-(--color-text) transition-colors duration-(--duration-fast) placeholder:text-(--color-muted)';

/** The default border, for a field with nothing wrong with it. */
export const FIELD_BORDER = 'border-(--color-on-brand-line)/45';

export const LABEL = 'block text-sm font-medium text-(--color-on-brand)';

/** Hints, counts and anything explaining a field rather than naming it. */
export const HINT = 'text-sm text-(--color-on-brand-2)';

/*
 * Errors keep the danger red rather than taking an on-brand colour. It is the
 * one thing on this screen that has to read as wrong rather than as quiet,
 * and `--danger-soft` behind it gives it a surface of its own to sit on so
 * the red never has to carry contrast against ink by itself.
 */
export const MESSAGE =
  'mt-2 rounded-(--radius-control) bg-(--color-danger-soft) px-2.5 py-1.5 text-sm text-(--color-danger)';

/*
 * White, not brand navy. The submit button used to be `--color-brand`, which
 * is the same navy the page is now made of — a primary action that dissolves
 * into its own background. On ink the brightest thing is the action.
 */
export const SUBMIT =
  'inline-flex h-11 w-full items-center justify-center gap-2 rounded-(--radius-control) bg-(--color-on-brand) px-4 text-base font-semibold text-(--color-brand-panel) transition-colors duration-(--duration-fast) hover:bg-(--color-on-brand-2) disabled:opacity-60';

/** A link inside the sign-in column — the accent, which is legible on ink. */
export const LINK =
  'font-medium text-(--color-accent-on-brand) underline-offset-4 hover:underline';
