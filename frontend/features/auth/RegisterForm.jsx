'use client';

import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useRouter } from 'next/navigation';

import { useAuth } from './AuthProvider';
import { AccountPreview } from './AccountPreview';
import { PasswordMeter } from './PasswordMeter';
import { useFieldEntrance } from './useFieldEntrance';
import { FIELD, LABEL, MESSAGE, SUBMIT } from './formStyles';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';

// The server's names for each field, where they differ from the form's.
const SERVER_FIELDS = { business_name: 'businessName' };

/*
 * Mirrors `Password::min(12)` in AppServiceProvider::definePasswordPolicy().
 * Stated here, never enforced here: the server owns every rule (ADR-012), and
 * submitting a shorter password still fails on the server rather than in the
 * browser. The API does not publish its password policy, so this is the one
 * number the client has to restate — see the missing-field note in ADR-033.
 */
const PASSWORD_MINIMUM = 12;

/**
 * A business signs itself up, and its owner lands in the setup wizard
 * (ADR-024).
 *
 * Four fields and no more: the business's name, the owner's name, and the
 * sign-in pair. Everything else — currency, VAT, the working week — is asked
 * in the wizard, where there is room to explain it.
 */
export function RegisterForm() {
  const { register: signUp } = useAuth();
  const { t, locale } = useI18n();
  const router = useRouter();
  const [formError, setFormError] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const fields = useFieldEntrance();

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { businessName: '', name: '', email: '', password: '' } });

  /*
   * `useWatch` rather than the `watch` function `useForm` also returns: that
   * one is a fresh closure on every render, which React Compiler cannot
   * memoize and therefore refuses to optimise the whole component around.
   * This is a subscription, and it re-renders only this component.
   *
   * Four fields, so a render per keystroke costs nothing on a form that has
   * nothing else to do. The preview and the meter are the only reason any of
   * it is read back.
   */
  const [businessName, name, password] = useWatch({
    control,
    name: ['businessName', 'name', 'password'],
  });

  async function onSubmit(values) {
    setFormError(null);

    try {
      // The interface language becomes the owner's, and names the business's
      // starting expense categories.
      await signUp({ ...values, locale });
      router.replace('/onboarding');
    } catch (error) {
      // The server owns every rule, the password policy included (ADR-012).
      if (error.isValidation) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          setError(SERVER_FIELDS[field] ?? field, { type: 'server', message });
        }

        return;
      }

      setFormError(error.message);
    }
  }

  function field(name, { label, type = 'text', autoComplete, ltr = false, required, hint }) {
    const error = errors[name];
    const describedBy = [error && `${name}-error`, hint && `${name}-hint`]
      .filter(Boolean)
      .join(' ');

    return (
      <div data-auth-field>
        <label htmlFor={name} className={LABEL}>
          {label}
        </label>
        <input
          id={name}
          type={type}
          dir={ltr ? 'ltr' : undefined}
          autoComplete={autoComplete}
          aria-invalid={error ? 'true' : 'false'}
          aria-describedby={describedBy || undefined}
          className={cn(
            FIELD,
            'mt-2',
            error ? 'border-(--color-danger)' : 'border-(--color-line-strong)',
          )}
          {...register(name, { required })}
        />
        {hint && !error && (
          <p id={`${name}-hint`} className="mt-2 text-sm text-(--color-muted)">
            {hint}
          </p>
        )}
        {error && (
          <p id={`${name}-error`} className={MESSAGE}>
            {error.message}
          </p>
        )}
      </div>
    );
  }

  return (
    <form ref={fields} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {formError && (
        <p
          role="alert"
          className="flex items-start gap-3 rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)"
        >
          <Icon name="alert" size={16} className="mt-1 shrink-0" />
          {formError}
        </p>
      )}

      {/*
        Said once, before anything is typed, rather than discovered four
        times at once. Every field here is required, so marking each label
        would repeat the same word down the form and still leave a reader to
        infer the rule from its absence elsewhere.
      */}
      <p data-auth-field className="text-sm text-(--color-muted)">
        {t('register.allRequired')}
      </p>

      {field('businessName', {
        label: t('register.businessName'),
        autoComplete: 'organization',
        required: t('register.businessNameRequired'),
      })}

      {field('name', {
        label: t('register.yourName'),
        autoComplete: 'name',
        required: t('register.nameRequired'),
      })}

      {/*
        Directly under the two names, because it is what they produce. Below
        the email and password it would read as a summary of the whole form.
      */}
      <AccountPreview
        businessName={businessName}
        name={name}
        roleLabel={t('roles.owner')}
      />

      {field('email', {
        label: t('auth.email'),
        type: 'email',
        autoComplete: 'email',
        ltr: true,
        required: t('auth.emailRequired'),
        hint: t('register.emailHint'),
      })}

      <div data-auth-field>
        <label htmlFor="password" className={LABEL}>
          {t('auth.password')}
        </label>
        <div className="relative mt-2">
          <input
            id="password"
            type={revealed ? 'text' : 'password'}
            // Pinned left to right, and the reveal control at its right edge,
            // for the reasons given on the sign-in form.
            dir="ltr"
            autoComplete="new-password"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? 'password-error' : 'password-hint'}
            className={cn(
              FIELD,
              // eslint-disable-next-line no-restricted-syntax -- deliberate, see LoginForm
              'pr-12',
              errors.password ? 'border-(--color-danger)' : 'border-(--color-line-strong)',
            )}
            {...register('password', { required: t('auth.passwordRequired') })}
          />
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-pressed={revealed}
            aria-controls="password"
            aria-label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-(--radius-control) text-(--color-muted) transition-colors duration-(--duration-fast) hover:text-(--color-text)"
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
        {isSubmitting ? t('register.creating') : t('register.submit')}
        {!isSubmitting && <Icon name="arrowRight" size={16} className="rtl:-scale-x-100" />}
      </button>
    </form>
  );
}
