'use client';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { greeting, initials } from '@/lib/person';

/**
 * What the two names are actually for, shown while they are typed.
 *
 * A sign-up form asks for a business name and a personal name and then says
 * nothing about either. Both have consequences the reader cannot guess: the
 * avatar takes the first letter of the first two words, the greeting uses the
 * first name alone, and the business name is what every screen will say this
 * session acts for. Someone typing "Ahmed Al Hawajri" has no way of knowing
 * the product will call them "Ahmed" until they are inside it.
 *
 * So this is the account chip and the greeting as they will really appear,
 * built from `lib/person.js` — the same functions `AppShell` and the
 * dashboard call. Not a mock-up of them: a preview that imitates the rules
 * instead of running them is a promise the product can break silently.
 *
 * It is information, not decoration, which is the only kind of flourish §2
 * of UI_UX_DIRECTION permits. No border and no card: the panel beside it is
 * already a frame, and a boxed preview on the light side would be one more
 * (see AuthLayout).
 *
 * `aria-hidden`, and deliberately. Everything in it is an echo of what the
 * reader has this moment typed into two fields that are themselves labelled;
 * read aloud it would repeat their own input back at them on every keystroke.
 * The fields are the accessible interface — this is a window onto the result.
 */
export function AccountPreview({ businessName, name, roleLabel }) {
  const { t } = useI18n();

  const business = businessName?.trim();
  const person = name?.trim();

  // Nothing to preview, nothing to show. It appears when it has something to
  // say and not a moment earlier.
  if (!business && !person) return null;

  return (
    <div aria-hidden="true" className="mt-5 border-t border-(--color-line) pt-4 select-none">
      {/* The house eyebrow label: 12px, 0.1em, uppercase — and the tracking
          is neutralised under Arabic by globals.css, where it would break the
          cursive join (UI_UX_DIRECTION §10). */}
      <p className="text-xs font-medium tracking-[0.1em] text-(--color-muted) uppercase">
        {t('register.preview')}
      </p>

      {/* The top bar's account chip, with the same pieces in the same order. */}
      <div className="mt-3 flex items-center gap-2.5">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-(--color-brand) text-xs font-semibold text-(--color-text-inverse)">
          {initials(person)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold text-(--color-text)" dir="auto">
            {person || t('register.previewNamePlaceholder')}
          </span>
          <span className="block text-xs text-(--color-muted)">{roleLabel}</span>
        </span>
      </div>

      {business && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-(--color-muted)">
          <Icon name="home" size={12} className="shrink-0 text-(--color-muted)" />
          <span className="truncate" dir="auto">
            {business}
          </span>
        </p>
      )}

      {/*
        The dashboard's own greeting, by the reader's clock. It is here
        because it is the one place the first-name rule becomes visible.
      */}
      {person && (
        <p className="mt-3 text-sm text-(--color-muted)" dir="auto">
          {greeting(t, person)}
        </p>
      )}
    </div>
  );
}
