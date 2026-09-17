'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from './AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';

export function LoginForm() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState(null);

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
          className="rounded-(--radius-sm) border border-(--color-warning) bg-(--color-surface) px-3 py-2 text-[0.8125rem] text-(--color-warning)"
        >
          {t('auth.sessionExpired')}
        </p>
      )}

      {formError && (
        <p
          role="alert"
          className="rounded-(--radius-sm) border border-(--color-negative) bg-(--color-surface) px-3 py-2 text-[0.8125rem] text-(--color-negative)"
        >
          {formError}
        </p>
      )}

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-xs font-medium uppercase tracking-wide text-(--color-text-muted)"
        >
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
          className="w-full rounded-(--radius-sm) border border-(--color-line-strong) bg-(--color-surface) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-text-subtle)"
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
          className="block text-xs font-medium uppercase tracking-wide text-(--color-text-muted)"
        >
          {t('auth.password')}
        </label>
        <input
          id="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          aria-invalid={errors.password ? 'true' : 'false'}
          aria-describedby={errors.password ? 'password-error' : undefined}
          className="w-full rounded-(--radius-sm) border border-(--color-line-strong) bg-(--color-surface) px-3 py-2 text-sm text-(--color-text)"
          {...register('password', { required: t('auth.passwordRequired') })}
        />
        {errors.password && (
          <p id="password-error" className="text-[0.8125rem] text-(--color-negative)">
            {errors.password.message}
          </p>
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-(--radius-sm) bg-(--color-accent) px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-(--color-accent-hover) disabled:opacity-60"
      >
        {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
      </button>
    </form>
  );
}
