'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { Icon } from '@/components/ui/Icon';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Card } from '@/components/layout/PageHeader';
import { useI18n } from '@/features/i18n/I18nProvider';
import { changePassword } from '@/services/auth';

/**
 * Changing your own password.
 *
 * The current password is asked for because the server requires it: it is
 * what tells a password change apart from someone using a machine left signed
 * in. The policy (twelve characters, checked against a breach corpus) belongs
 * to the server too, so a refusal is shown as the server worded it rather
 * than guessed at here (ADR-012).
 */
export function ChangePasswordCard() {
  const { t } = useI18n();

  const [values, setValues] = useState({ current_password: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [done, setDone] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const mutation = useMutation({ mutationFn: changePassword });

  function set(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
    setDone(false);
  }

  async function submit(event) {
    event.preventDefault();
    setFailure(null);
    setFieldErrors({});
    setDone(false);

    try {
      await mutation.mutateAsync(values);
      setValues({ current_password: '', password: '' });
      setDone(true);
    } catch (error) {
      if (error.isValidation) {
        setFieldErrors(error.fieldErrors);

        return;
      }

      setFailure(error.message);
    }
  }

  return (
    <Card title={t('profile.password.title')} description={t('profile.password.description')}>
      <form onSubmit={submit} noValidate className="max-w-md space-y-4">
        {failure && (
          <p
            role="alert"
            className="rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)"
          >
            {failure}
          </p>
        )}

        {done && (
          <p
            role="status"
            className="flex items-start gap-2 rounded-(--radius-control) bg-(--color-success-soft) px-4 py-3 text-sm text-(--color-success)"
          >
            <Icon name="check" size={16} className="mt-0.5 shrink-0" />
            {t('profile.password.done')}
          </p>
        )}

        <Field label={t('profile.password.current')} error={fieldErrors.current_password} required>
          {(props) => (
            <Input
              type={revealed ? 'text' : 'password'}
              dir="ltr"
              autoComplete="current-password"
              value={values.current_password}
              onChange={(event) => set('current_password', event.target.value)}
              {...props}
            />
          )}
        </Field>

        <Field
          label={t('profile.password.next')}
          hint={t('register.passwordHint', { min: 12 })}
          error={fieldErrors.password}
          required
        >
          {(props) => (
            <Input
              type={revealed ? 'text' : 'password'}
              dir="ltr"
              autoComplete="new-password"
              value={values.password}
              onChange={(event) => set('password', event.target.value)}
              {...props}
            />
          )}
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--color-text-2)">
          <input
            type="checkbox"
            checked={revealed}
            onChange={(event) => setRevealed(event.target.checked)}
            className="size-3.5 cursor-pointer accent-(--color-brand)"
          />
          {t('auth.showPassword')}
        </label>

        <div className="flex items-center gap-3">
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {t('profile.password.submit')}
          </Button>
          {/* Said before it happens, not discovered afterwards. */}
          <p className="text-sm text-(--color-muted)">{t('profile.password.signsOutDevices')}</p>
        </div>
      </form>
    </Card>
  );
}
