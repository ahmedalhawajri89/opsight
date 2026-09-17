'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useI18n } from '@/features/i18n/I18nProvider';
import { LOCALES, intlTag } from '@/lib/i18n/config';

/**
 * Language and digits, for the signed-in user.
 *
 * Saved on the ACCOUNT (PATCH /me/preferences), so the choice follows the
 * person to another device and the server writes its own sentences — insights,
 * validation messages — in the same language.
 *
 * The preview formats a real figure with the choice as it currently stands,
 * before anything is saved. "Western" and "Arabic-Indic" are labels most
 * readers have never needed; "BHD 48,210.500" beside "٤٨٬٢١٠٫٥٠٠ د.ب." is not.
 */
export function PreferencesDialog({ open, onClose }) {
  const { t, locale, numerals, setPreferences } = useI18n();

  const [draft, setDraft] = useState(null);
  const [state, setState] = useState({ saving: false, error: null });

  const current = draft ?? { locale, numerals };

  function close() {
    setDraft(null);
    setState({ saving: false, error: null });
    onClose();
  }

  async function save() {
    setState({ saving: true, error: null });

    try {
      await setPreferences(current);
      // The provider remounts the application in the new language, which
      // unmounts this dialog along with everything else; nothing to reset.
      close();
    } catch (error) {
      setState({ saving: false, error });
    }
  }

  const preview = new Intl.NumberFormat(intlTag(current.locale, current.numerals), {
    style: 'currency',
    currency: 'BHD',
    minimumFractionDigits: 3,
  }).format(48210.5);

  return (
    <Dialog
      open={open}
      onClose={close}
      title={t('preferences.title')}
      description={t('preferences.description')}
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={state.saving}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" onClick={save} loading={state.saving}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-2 text-xs font-medium text-(--color-text-muted)">
          {t('preferences.language')}
        </legend>

        <div className="grid grid-cols-2 gap-2">
          {Object.entries(LOCALES).map(([code, config]) => (
            <Choice
              key={code}
              name="locale"
              checked={current.locale === code}
              onChange={() => setDraft({ ...current, locale: code })}
              // Each language is named in ITSELF, so a reader can find their
              // own language without being able to read the current one.
              label={<span lang={code}>{config.nativeName}</span>}
            />
          ))}
        </div>
      </fieldset>

      {current.locale === 'ar' && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-xs font-medium text-(--color-text-muted)">
            {t('preferences.numerals')}
          </legend>

          <div className="grid grid-cols-2 gap-2">
            <Choice
              name="numerals"
              checked={current.numerals === 'latn'}
              onChange={() => setDraft({ ...current, numerals: 'latn' })}
              label={t('preferences.western')}
              hint="0123456789"
            />
            <Choice
              name="numerals"
              checked={current.numerals === 'arab'}
              onChange={() => setDraft({ ...current, numerals: 'arab' })}
              label={t('preferences.arabicIndic')}
              hint="٠١٢٣٤٥٦٧٨٩"
            />
          </div>
        </fieldset>
      )}

      <div className="mt-5 rounded-(--radius-md) bg-(--color-surface-sunken) px-4 py-3">
        <p className="text-xs text-(--color-text-muted)">{t('preferences.preview')}</p>
        <p
          dir={LOCALES[current.locale].dir}
          className="tabular mt-1 text-lg font-semibold text-(--color-text)"
        >
          {preview}
        </p>
      </div>

      {state.error && (
        <p role="alert" className="mt-3 text-[0.8125rem] text-(--color-negative)">
          {state.error.message ?? t('states.error.unexpected')}
        </p>
      )}
    </Dialog>
  );
}

function Choice({ name, checked, onChange, label, hint }) {
  return (
    <label
      className={
        'flex cursor-pointer flex-col gap-0.5 rounded-(--radius-md) border px-3 py-2.5 transition-colors ' +
        (checked
          ? 'border-(--color-accent) bg-(--color-accent-subtle)'
          : 'border-(--color-line) hover:bg-(--color-surface-hover)')
      }
    >
      <span className="flex items-center gap-2 text-sm font-medium text-(--color-text)">
        <input
          type="radio"
          name={name}
          checked={checked}
          onChange={onChange}
          className="accent-(--color-accent)"
        />
        {label}
      </span>
      {hint && (
        <span className="ps-6 font-mono text-xs text-(--color-text-subtle)" dir="ltr">
          {hint}
        </span>
      )}
    </label>
  );
}
