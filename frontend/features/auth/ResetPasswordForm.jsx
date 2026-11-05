'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';

import { FieldGlyph } from './FieldGlyph';
import { FIELD, FIELD_BORDER, FIELD_ICON, HINT, LABEL, LINK, MESSAGE, SUBMIT } from './formStyles';
import { PasswordMeter } from './PasswordMeter';
import { PASSWORD_MINIMUM } from './RegisterForm';
import { useFieldEntrance } from './useFieldEntrance';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { resetPassword } from '@/services/auth';

/**
 * A new password, from the link in the email.
 *
 * The link carries the token and the address (ResetPasswordNotification), so
 * the address is shown, not asked for: retyping it could only introduce a
 * mismatch. The account is NOT signed in afterwards; the reader is sent to
 * sign in with the new password, through the same throttled door as anyone.
 *
 * A link that has expired, been used, or been mangled by a mail client all
 * get one message and one way forward: ask for another.
 */
export function ResetPasswordForm() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';

  const [revealed, setRevealed] = useState(false);
  const [linkError, setLinkError] = useState(null);
  const fields = useFieldEntrance();

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    control,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { password: '' } });

  /*
   * The cursor starts where the work does, but only with a fine pointer: on a
   * touch screen it would throw the keyboard up before anyone decided to
   * type. Focused after mount rather than through `autoFocus`, which would
   * render differently on the server and in the browser.
   */
  useEffect(() => {
    if (window.matchMedia('(pointer: fine)').matches) setFocus('password');
  }, [setFocus]);

  const password = useWatch({ control, name: 'password' });

  if (token === '' || email === '') {
    return <BrokenLink message={t('reset.incomplete')} />;
  }

  if (linkError) {
    return <BrokenLink message={linkError} />;
  }

  async function onSubmit(values) {
    try {
      await resetPassword({ token, email, password: values.password });
      router.replace('/login?reset=1');
    } catch (error) {
      if (error.isValidation) {
        const { token: tokenError, ...rest } = error.fieldErrors;

        // The token and the address are not fields on this screen; a refusal
        // of either is the link itself failing.
        if (tokenError || rest.email) {
          setLinkError(tokenError ?? rest.email);

          return;
        }

        for (const [field, message] of Object.entries(rest)) {
          setError(field, { type: 'server', message });
        }

        return;
      }

      setLinkError(error.message);
    }
  }

  return (
    <form ref={fields} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      <p data-auth-field className={cn('text-center', HINT)}>
        {t('reset.forAccount')}{' '}
        <bdi dir="ltr" className="font-semibold text-(--color-text)">
          {email}
        </bdi>
      </p>

      {/* A hidden username lets a password manager file the new password under the right account. */}
      <input type="email" autoComplete="username" value={email} readOnly hidden />

      <div data-auth-field>
        <label htmlFor="password" className={LABEL}>
          {t('reset.newPassword')}
        </label>
        <div className="relative mt-2">
          <FieldGlyph name="lock" />
          <input
            id="password"
            type={revealed ? 'text' : 'password'}
            dir="ltr"
            autoComplete="new-password"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? 'password-error' : 'password-hint'}
            className={cn(
              FIELD,
              FIELD_ICON,
              // eslint-disable-next-line no-restricted-syntax -- deliberate, see LoginForm
              'pr-12',
              errors.password ? 'border-(--color-danger)' : FIELD_BORDER,
            )}
            {...register('password', { required: t('auth.passwordRequired') })}
          />
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-pressed={revealed}
            aria-controls="password"
            aria-label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            className="absolute inset-y-0 right-0 inline-flex w-12 items-center justify-center rounded-(--radius-control) text-(--color-muted) transition-colors duration-(--duration-fast) hover:text-(--color-brand-text)"
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} size={18} />
          </button>
        </div>
        {errors.password ? (
          <p id="password-error" className={MESSAGE}>
            {errors.password.message}
          </p>
        ) : (
          <PasswordMeter value={password} minimum={PASSWORD_MINIMUM} />
        )}
      </div>

      <button data-auth-field type="submit" disabled={isSubmitting} className={SUBMIT}>
        {isSubmitting ? t('reset.saving') : t('reset.save')}
        {!isSubmitting && <Icon name="arrowRight" size={18} className="rtl:-scale-x-100" />}
      </button>
    </form>
  );
}

function BrokenLink({ message }) {
  const { t } = useI18n();

  return (
    <div className="space-y-5 text-center">
      <p
        role="alert"
        className="flex items-start gap-3 rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-start text-sm text-(--color-danger)"
      >
        <Icon name="alert" size={16} className="mt-1 shrink-0" />
        {message}
      </p>
      <Link href="/forgot-password" className={SUBMIT}>
        {t('reset.askAgain')}
      </Link>
      <p className="text-sm">
        <Link href="/login" className={LINK}>
          {t('reset.backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
