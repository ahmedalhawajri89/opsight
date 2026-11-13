'use client';

import { useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { resendVerification } from '@/services/auth';

/**
 * A quiet line above every page until the account's address is confirmed.
 *
 * It says what waits on it — the morning brief by email, and signing in with
 * Google — rather than nagging in general, and offers the one thing to do:
 * send the link again. Nothing else in the application is held back.
 */
export function VerifyEmailBanner() {
  const { t } = useI18n();
  const { user } = useAuth();
  const [state, setState] = useState('idle');

  if (!user || user.email_verified !== false) return null;

  async function resend() {
    setState('sending');

    try {
      await resendVerification();
      setState('sent');
    } catch {
      setState('failed');
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-(--radius-card) border border-(--color-warning) bg-(--color-warning-soft) px-4 py-3 text-sm text-(--color-warning) print:hidden"
    >
      <Icon name="mail" size={18} className="shrink-0" />
      <p className="min-w-0 flex-1">
        <span className="font-semibold">{t('verify.banner.title')}</span>{' '}
        {t('verify.banner.body', { email: user.email })}
      </p>

      {state === 'sent' ? (
        <span className="flex items-center gap-1.5 font-medium">
          <Icon name="check" size={16} />
          {t('verify.banner.sent')}
        </span>
      ) : (
        <Button size="sm" variant="secondary" loading={state === 'sending'} onClick={resend}>
          {state === 'failed' ? t('verify.banner.retry') : t('verify.banner.resend')}
        </Button>
      )}
    </div>
  );
}
