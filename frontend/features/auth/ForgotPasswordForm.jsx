'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';

import { FieldGlyph } from './FieldGlyph';
import { FIELD, FIELD_BORDER, FIELD_ICON, HINT, LABEL, LINK, MESSAGE, SUBMIT } from './formStyles';
import { useFieldEntrance } from './useFieldEntrance';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { forgotPassword } from '@/services/auth';

/**
 * Asking for a link to choose a new password.
 *
 * WHAT IT SAYS AFTERWARDS IS THE SAME FOR EVERY ADDRESS. The server answers
 * alike for a real account and an unknown one, so this screen does too: it
 * says a link is on its way IF the address has an account. Saying "sent!" or
 * "no such account" would undo, in the browser, the care the server took not
 * to tell (PasswordResetController).
 */
export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [sentTo, setSentTo] = useState(null);
  const [formError, setFormError] = useState(null);
  const fields = useFieldEntrance();

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '' } });

  /*
   * The cursor starts where the work does, but only with a fine pointer: on a
   * touch screen it would throw the keyboard up before anyone decided to
   * type. Focused after mount rather than through `autoFocus`, which would
   * render differently on the server and in the browser.
   */
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) setFocus('email');
  }, [setFocus]);

  async function onSubmit({ email }) {
    setFormError(null);

    try {
      await forgotPassword({ email });
      setSentTo(email);
    } catch (error) {
      if (error.isValidation) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          setError(field, { type: 'server', message });
        }

        return;
      }

      setFormError(error.message);
    }
  }

  if (sentTo) {
    return (
      <div role="status" className="space-y-5 text-center">
        <span className="mx-auto inline-flex size-14 items-center justify-center rounded-full bg-(--color-accent-on-brand)/15 text-(--color-accent-strong)">
          <Icon name="mail" size={26} />
        </span>
        <div>
          <p className="text-base font-semibold text-(--color-text)">{t('reset.sentTitle')}</p>
          <p className={cn('mt-2', HINT)}>{t('reset.sent')}</p>
          <p className="mt-1 text-sm font-semibold break-all text-(--color-text)" dir="ltr">
            {sentTo}
          </p>
          <p className={cn('mt-2', HINT)}>{t('reset.sentExpiry')}</p>
        </div>
        <button type="button" onClick={() => setSentTo(null)} className={cn(LINK, 'text-sm')}>
          {t('reset.differentAddress')}
        </button>
      </div>
    );
  }

  return (
    <form ref={fields} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {formError && (
        <p
          role="alert"
          className="flex items-start gap-3 rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)"
        >
          <Icon name="alert" size={16} className="mt-1 shrink-0" />
          {formError}
        </p>
      )}

      <div data-auth-field>
        <label htmlFor="email" className={LABEL}>
          {t('auth.email')}
        </label>
        <div className="relative mt-2">
          <FieldGlyph name="mail" />
          <input
            id="email"
            type="email"
            dir="ltr"
            autoComplete="username"
            aria-invalid={errors.email ? 'true' : 'false'}
            aria-describedby={errors.email ? 'email-error' : undefined}
            className={cn(
              FIELD,
              FIELD_ICON,
              errors.email ? 'border-(--color-danger)' : FIELD_BORDER,
            )}
            placeholder={t('auth.emailPlaceholder')}
            {...register('email', { required: t('auth.emailRequired') })}
          />
        </div>
        {errors.email && (
          <p id="email-error" className={MESSAGE}>
            {errors.email.message}
          </p>
        )}
      </div>

      <button data-auth-field type="submit" disabled={isSubmitting} className={SUBMIT}>
        {isSubmitting ? t('reset.sending') : t('reset.send')}
        {!isSubmitting && <Icon name="arrowRight" size={18} className="rtl:-scale-x-100" />}
      </button>

      <p data-auth-field className="text-center text-sm">
        <Link href="/login" className={LINK}>
          {t('reset.backToSignIn')}
        </Link>
      </p>
    </form>
  );
}
