/**
 * The look of the fields on the sign-in and sign-up screens, shared so the two
 * forms cannot drift apart. Larger than the in-app controls (h-11): these are
 * the first fields anyone meets, often on a phone.
 *
 * THESE SIT ON THE CARD, NOT ON INK. The door is two halves now: a panel of
 * brand ink carrying the argument (AuthHero), and a light card carrying the
 * task (AuthLayout). Everything on the card takes the application's own text
 * tokens, so in the dark theme the card follows the theme like any other
 * surface, while the ink panel beside it stays ink in both.
 *
 * A side effect worth having: a browser paints its own background into an
 * autofilled field and no stylesheet can override it. On ink that arrived as a
 * pale rectangle; on a light card it lands where it belongs.
 *
 * `FIELD_ICON` leaves room for a glyph at the start of the field. The fields
 * on this screen hold an address and a password, both pinned left to right in
 * every language, so the glyph sits on the physical left with the content it
 * introduces (see the note on the reveal button in LoginForm).
 */
export const FIELD =
  'h-12 w-full rounded-(--radius-control) border bg-(--color-surface) px-4 text-base text-(--color-text) transition-[border-color,box-shadow] duration-(--duration-fast) placeholder:text-(--color-muted) hover:border-(--color-brand)/50 focus:border-(--color-brand)';

export const FIELD_ICON = 'pl-11';

/** The default border, for a field with nothing wrong with it. */
export const FIELD_BORDER = 'border-(--color-line-strong)';

export const LABEL = 'block text-sm font-semibold text-(--color-text)';

/** Hints, counts and anything explaining a field rather than naming it. */
export const HINT = 'text-sm text-(--color-muted)';

/*
 * Errors keep the danger red, on `--danger-soft`, so the message has a surface
 * of its own and the red never has to carry contrast by itself.
 */
export const MESSAGE =
  'mt-2 rounded-(--radius-control) bg-(--color-danger-soft) px-2.5 py-1.5 text-sm text-(--color-danger)';

/*
 * THE ACCENT, and the only saturated colour on the card.
 *
 * Bronze, lifted at the top: a gradient from the hover shade down to the
 * resting one reads as a raised key rather than a flat label, and both ends
 * keep the navy text above AA (tests/contrast.test.js). On hover the whole
 * key takes the lifted shade.
 */
export const SUBMIT =
  'group inline-flex h-12 w-full items-center justify-center gap-2 rounded-(--radius-control) bg-linear-to-b from-(--color-accent-on-brand-strong) to-(--color-accent-on-brand) px-4 text-base font-bold text-(--color-brand-panel) shadow-[0_10px_24px_-12px_rgb(224_164_76/0.9)] transition-[filter,box-shadow,transform] duration-(--duration-fast) hover:brightness-105 hover:shadow-[0_14px_28px_-12px_rgb(224_164_76/1)] active:translate-y-px disabled:opacity-60';

/** A link on the card. */
export const LINK = 'font-semibold text-(--color-brand-text) underline-offset-4 hover:underline';
