import { Icon } from '@/components/ui/Icon';

/**
 * The glyph at the start of a sign-in field. Decorative (the label names the
 * field), and it lets clicks through to the input beneath it.
 *
 * Physical left, with the left-to-right content it introduces: the fields
 * that carry one hold an address or a password, both pinned left to right in
 * every language (formStyles.js). Pair it with `FIELD_ICON` on the input.
 */
export function FieldGlyph({ name }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 left-0 inline-flex w-11 items-center justify-center text-(--color-muted)"
    >
      <Icon name={name} size={18} />
    </span>
  );
}
