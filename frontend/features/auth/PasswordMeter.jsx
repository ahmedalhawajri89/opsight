'use client';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';

/**
 * How far a password is from the one rule this form is allowed to know.
 *
 * NOT A STRENGTH METER. The usual version scores a password out of four and
 * calls it "weak" or "strong" against rules the client made up — which is
 * exactly what ADR-012 forbids: the server owns validation truth, and a
 * client that invents a rule either contradicts the server or, worse, quietly
 * agrees with it until one of them changes. This measures length and nothing
 * else, because the length is the single rule already stated on screen.
 *
 * THE RULE THE READER COULD NOT SEE. `Password::defaults()` on the server is
 * `min(12)->uncompromised()` outside the test environment — so a twelve
 * character password that has appeared in a known breach is refused, after a
 * round trip, by a form that never mentioned it. Someone picks a password
 * they have used for years, which is precisely the kind most likely to be in
 * a breach list, and is told no for a reason nothing prepared them for. The
 * check stays on the server, where it belongs; what changes here is that the
 * form says it is coming.
 *
 * The bar is `aria-hidden` and the count is not announced on every keystroke:
 * a live region firing per character is unusable. The one thing worth
 * announcing is crossing the threshold, which the status line does once.
 */
export function PasswordMeter({ value, minimum }) {
  const { t } = useI18n();

  const length = value?.length ?? 0;
  const met = length >= minimum;

  /*
   * Nothing at all until there is something to measure. An empty bar beside
   * an empty field is a progress indicator for a task nobody has started,
   * and it makes the form look like it is already judging.
   */
  if (length === 0) {
    return (
      <p id="password-hint" className="mt-2 space-y-1 text-sm text-(--color-muted)">
        <span className="block">{t('register.passwordHint', { min: minimum })}</span>
        <span className="block">{t('register.passwordBreached')}</span>
      </p>
    );
  }

  /*
   * mt-3, not mt-2 like the other hints: the field's focus ring sits 2px
   * outside its border, and at the smaller gap the bar read as an underline
   * belonging to the input rather than a measure of what is in it.
   */
  return (
    <div id="password-hint" className="mt-3">
      <span
        aria-hidden="true"
        className="block h-1 w-full overflow-hidden rounded-(--radius-pill) bg-(--color-line)"
      >
        <span
          className={cn(
            'block h-full rounded-(--radius-pill) transition-[width,background-color] duration-(--duration-fast)',
            met ? 'bg-(--color-success)' : 'bg-(--color-muted)',
          )}
          style={{ width: `${Math.min(100, (length / minimum) * 100)}%` }}
        />
      </span>

      {/*
        Polite, and only two states, so it speaks when the threshold is
        crossed rather than on every letter.
      */}
      <p
        role="status"
        className={cn(
          'mt-2 flex items-start gap-2 text-sm',
          met ? 'text-(--color-success)' : 'text-(--color-muted)',
        )}
      >
        {met && <Icon name="check" size={15} className="mt-0.5 shrink-0" />}
        <span>
          {met ? t('register.passwordLongEnough') : t('register.passwordHint', { min: minimum })}
        </span>
      </p>

      <p className="mt-1 text-sm text-(--color-muted)">{t('register.passwordBreached')}</p>
    </div>
  );
}
