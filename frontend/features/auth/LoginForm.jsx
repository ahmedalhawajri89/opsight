'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from './AuthProvider';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';

const FIELD =
  'h-11 w-full rounded-(--radius-md) border bg-(--color-surface) px-3.5 text-sm text-(--color-text) transition-colors duration-(--duration-fast) placeholder:text-(--color-text-subtle)';

export function LoginForm() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState(null);
  const [revealed, setRevealed] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '' } });

  const sessionExpired = searchParams.get('expired') === '1';

  async function onSubmit(values) {
    setFormError(null);

    try {
      await login(values);
      router.replace('/dashboard');
    } catch (error) {
      /*
       * The server is the source of validation truth. A 422 is mapped field by
       * field onto the form; the client never invents a message for a rule it
       * does not own (ADR-012).
       */
      if (error.isValidation) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          setError(field, { type: 'server', message });
        }

        return;
      }

      setFormError(error.message);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-5">
      {sessionExpired && (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-(--radius-md) bg-(--color-warning-subtle) px-3.5 py-3 text-[0.8125rem] text-(--color-warning)"
        >
          <Icon name="clock" size={16} className="mt-px shrink-0" />
          {t('auth.sessionExpired')}
        </p>
      )}

      {formError && (
        <p
          role="alert"
          className="flex items-start gap-2.5 rounded-(--radius-md) bg-(--color-negative-subtle) px-3.5 py-3 text-[0.8125rem] text-(--color-negative)"
        >
          <Icon name="alert" size={16} className="mt-px shrink-0" />
          {formError}
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="email" className="block text-[0.8125rem] font-medium text-(--color-text)">
          {t('auth.email')}
        </label>
        <input
          id="email"
          type="email"
          // An address is left-to-right in every language; typed into a
          // right-to-left field its "@" and "." visibly jump around.
          dir="ltr"
          autoComplete="username"
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={cn(
            FIELD,
            errors.email ? 'border-(--color-negative)' : 'border-(--color-line-strong)',
          )}
          placeholder="you@company.com"
          {...register('email', { required: t('auth.emailRequired') })}
        />
        {errors.email && (
          <p id="email-error" className="text-[0.8125rem] text-(--color-negative)">
            {errors.email.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-[0.8125rem] font-medium text-(--color-text)"
        >
          {t('auth.password')}
        </label>
        <div className="relative">
          <input
            id="password"
            type={revealed ? 'text' : 'password'}
            dir="ltr"
            autoComplete="current-password"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? 'password-error' : undefined}
            className={cn(
              FIELD,
              'pe-11',
              errors.password ? 'border-(--color-negative)' : 'border-(--color-line-strong)',
            )}
            {...register('password', { required: t('auth.passwordRequired') })}
          />
          {/*
            Typing a password blind is where sign-in most often fails, and this
            is the one screen where nobody is signed in to be shoulder-surfed
            out of a session. The state is announced, not only drawn.
          */}
          <button
            type="button"
            onClick={() => setRevealed((value) => !value)}
            aria-pressed={revealed}
            aria-controls="password"
            title={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            className="absolute inset-y-0 end-0 inline-flex w-11 items-center justify-center rounded-(--radius-md) text-(--color-text-subtle) transition-colors duration-(--duration-fast) hover:text-(--color-text)"
          >
            <Icon
              name={revealed ? 'eyeOff' : 'eye'}
              size={17}
              label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            />
          </button>
        </div>
        {errors.password && (
          <p id="password-error" className="text-[0.8125rem] text-(--color-negative)">
            {errors.password.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-(--radius-md) bg-(--color-accent) px-4 text-sm font-semibold text-(--color-text-inverse) transition-colors duration-(--duration-fast) hover:bg-(--color-accent-hover) disabled:opacity-60"
      >
        {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
        {!isSubmitting && <Icon name="arrowRight" size={16} className="rtl:-scale-x-100" />}
      </button>
    </form>
  );
}
