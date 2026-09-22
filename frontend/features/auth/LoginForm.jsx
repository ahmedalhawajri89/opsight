'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';

import { useAuth } from './AuthProvider';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';

const FIELD =
  'h-11 w-full rounded-(--radius-control) border bg-(--color-surface) px-4 text-base text-(--color-text) transition-colors duration-(--duration-fast) placeholder:text-(--color-muted)';

const LABEL = 'block text-sm font-medium text-(--color-text)';

// Mirrors LoginRequest::REMEMBER_MINUTES on the server; stated, not enforced, here.
const REMEMBER_DAYS = 30;
const MESSAGE = 'mt-2 text-sm text-(--color-danger)';

export function LoginForm() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState(null);
  const [failures, setFailures] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({ defaultValues: { email: '', password: '', remember: false } });

  const sessionExpired = searchParams.get('expired') === '1';

  async function onSubmit(values) {
    setFormError(null);

    try {
      await login(values);
      router.replace('/dashboard');
    } catch (error) {
      setFailures((count) => count + 1);

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
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {sessionExpired && (
        <p
          role="status"
          className="flex items-start gap-3 rounded-(--radius-control) bg-(--color-warning-soft) px-4 py-3 text-sm text-(--color-warning)"
        >
          <Icon name="clock" size={16} className="mt-1 shrink-0" />
          {t('auth.sessionExpired')}
        </p>
      )}

      {formError && (
        <p
          role="alert"
          className="flex items-start gap-3 rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)"
        >
          <Icon name="alert" size={16} className="mt-1 shrink-0" />
          {formError}
        </p>
      )}

      <div>
        <label htmlFor="email" className={LABEL}>
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
            'mt-2',
            errors.email ? 'border-(--color-danger)' : 'border-(--color-line-strong)',
          )}
          placeholder="you@company.com"
          {...register('email', { required: t('auth.emailRequired') })}
        />
        {errors.email && (
          <p id="email-error" className={MESSAGE}>
            {errors.email.message}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="password" className={LABEL}>
          {t('auth.password')}
        </label>
        <div className="relative mt-2">
          <input
            id="password"
            type={revealed ? 'text' : 'password'}
            // Left to right for the same reason as the address: revealed in a
            // right-to-left field, `Str0ng-Pass!` renders as `!Str0ng-Pass`,
            // and the one job of this control is to let someone check what
            // they typed.
            dir="ltr"
            autoComplete="current-password"
            aria-invalid={errors.password ? 'true' : 'false'}
            aria-describedby={errors.password ? 'password-error' : undefined}
            /*
             * The padding here and the button below are the codebase's one
             * deliberate use of a physical side. The field's content is pinned
             * left to right, so the reveal control belongs at the end of what
             * was typed — the right — in both languages. A logical `end` puts
             * it at the left in Arabic, on top of the first characters.
             */
            className={cn(
              FIELD,
              // eslint-disable-next-line no-restricted-syntax -- deliberate, see above
              'pr-12',
              errors.password ? 'border-(--color-danger)' : 'border-(--color-line-strong)',
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
            aria-label={revealed ? t('auth.hidePassword') : t('auth.showPassword')}
            className="absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center rounded-(--radius-control) text-(--color-muted) transition-colors duration-(--duration-fast) hover:text-(--color-text)"
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} size={18} />
          </button>
        </div>
        {errors.password && (
          <p id="password-error" className={MESSAGE}>
            {errors.password.message}
          </p>
        )}
      </div>

      {/*
        Off by default, and it says for how long and where not to use it —
        the two things a person needs to decide, stated at the moment they
        decide. The whole row is the target, well past 44px wide.
      */}
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-4 shrink-0 cursor-pointer accent-(--color-brand)"
          aria-describedby="remember-hint"
          {...register('remember')}
        />
        <span>
          <span className="block text-sm font-medium text-(--color-text)">
            {t('auth.remember')}
          </span>
          <span id="remember-hint" className="block text-sm text-(--color-muted)">
            {t('auth.rememberHint', { days: REMEMBER_DAYS })}
          </span>
        </span>
      </label>

      <button
        type="submit"
        disabled={isSubmitting}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-(--radius-control) bg-(--color-brand) px-4 text-base font-semibold text-(--color-text-inverse) transition-colors duration-(--duration-fast) hover:bg-(--color-brand-hover) disabled:opacity-60"
      >
        {isSubmitting ? t('auth.signingIn') : t('auth.signIn')}
        {!isSubmitting && <Icon name="arrowRight" size={16} className="rtl:-scale-x-100" />}
      </button>

      {/*
        The lockout is not a welcome message. Nobody arriving at this screen
        needs to be told how sign-in fails; the person on their second attempt
        does, before they spend the remaining three.
      */}
      {failures > 0 && (
        <p role="status" className="measure text-sm text-(--color-muted)">
          {t('login.lockoutNote')}
        </p>
      )}
    </form>
  );
}
