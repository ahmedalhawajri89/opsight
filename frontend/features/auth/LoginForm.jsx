'use client';

import { useCallback, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter, useSearchParams } from 'next/navigation';
import { gsap } from 'gsap';

import { useAuth } from './AuthProvider';
import { useFieldEntrance } from './useFieldEntrance';
import { FIELD, LABEL, MESSAGE, SUBMIT } from './formStyles';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';

// Mirrors LoginRequest::REMEMBER_MINUTES on the server; stated, not enforced, here.
const REMEMBER_DAYS = 30;

export function LoginForm() {
  const { login } = useAuth();
  const { t } = useI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [formError, setFormError] = useState(null);
  const [failures, setFailures] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const reducedMotion = useReducedMotion();
  const fields = useFieldEntrance();

  /*
   * One short shake, and only for a refusal the fields cannot explain —
   * "those credentials are wrong" has nowhere else to point. A field error
   * already marks its own field red, and shaking the whole form for a
   * missing email would be noise.
   *
   * A callback ref rather than a tween fired from the submit handler: it
   * runs when the element is on the page, and because the banner is keyed on
   * the attempt count, a second refusal remounts it — so the shake repeats
   * and role="alert" announces again, which a re-render alone would not do.
   */
  const shakeOnMount = useCallback(
    (node) => {
      if (node === null || reducedMotion) return;

      gsap.fromTo(node, { x: -6 }, { x: 0, duration: 0.45, ease: 'elastic.out(1, 0.35)' });
    },
    [reducedMotion],
  );

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
    <form ref={fields} onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
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
          key={failures}
          ref={shakeOnMount}
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
        <input
          id="email"
          type="email"
          // An address is left-to-right in every language; typed into a
          // right-to-left field its "@" and "." visibly jump around.
          dir="ltr"
          autoComplete="username"
          /*
           * The cursor starts where the work does. Not on a touch device:
           * autofocus there throws up the keyboard over half the screen
           * before anyone has decided to type.
           */
          autoFocus={typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches}
          aria-invalid={errors.email ? 'true' : 'false'}
          aria-describedby={errors.email ? 'email-error' : undefined}
          className={cn(
            FIELD,
            'mt-2',
            errors.email ? 'border-(--color-danger)' : 'border-(--color-line-strong)',
          )}
          placeholder={t('auth.emailPlaceholder')}
          {...register('email', { required: t('auth.emailRequired') })}
        />
        {errors.email && (
          <p id="email-error" className={MESSAGE}>
            {errors.email.message}
          </p>
        )}
      </div>

      <div data-auth-field>
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
            /*
             * Caps Lock is the quiet reason a correct password is refused,
             * and the one thing a reader cannot see while typing blind.
             * Read from the keyboard event's modifier state rather than
             * tracked by hand, so it is right even when the key was pressed
             * before this page was open.
             */
            onKeyUp={(event) => setCapsLock(event.getModifierState?.('CapsLock') ?? false)}
            onBlur={() => setCapsLock(false)}
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

        {/*
          A warning, not an error: nothing has gone wrong yet, and saying so
          before the attempt is the whole point. Announced politely so it does
          not interrupt someone mid-word.
        */}
        {capsLock && (
          <p role="status" className="mt-2 flex items-center gap-2 text-sm text-(--color-warning)">
            <Icon name="alert" size={14} className="shrink-0" />
            {t('auth.capsLock')}
          </p>
        )}
      </div>

      {/*
        Off by default, and it says for how long and where not to use it —
        the two things a person needs to decide, stated at the moment they
        decide. The whole row is the target, well past 44px wide.
      */}
      <label data-auth-field className="flex cursor-pointer items-start gap-3">
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

      <button data-auth-field type="submit" disabled={isSubmitting} className={SUBMIT}>
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
