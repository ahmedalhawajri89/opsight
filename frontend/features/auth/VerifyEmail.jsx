'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { LINK, SUBMIT } from './formStyles';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { AUTH_QUERY_KEY } from '@/features/auth/AuthProvider';
import { verifyEmail } from '@/services/auth';

/**
 * Opening the link in a confirmation email.
 *
 * The link carries the account, an expiry and a signature; this posts them
 * back once and says how it went. No form and nothing to type: the click in
 * the inbox was the whole of the user's part. It works signed in or not, on
 * any device, because the signature is the proof.
 */
export function VerifyEmail() {
  const { t } = useI18n();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const sent = useRef(false);

  const id = params.get('id');
  const expires = params.get('expires');
  const signature = params.get('signature');
  const complete = Boolean(id && expires && signature);

  const [state, setState] = useState(complete ? 'working' : 'broken');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    // Once: Strict Mode runs effects twice in development.
    if (!complete || sent.current) return;
    sent.current = true;

    verifyEmail({ id: Number(id), expires: Number(expires), signature })
      .then(() => {
        setState('done');
        // A signed-in session refreshes its banner.
        queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      })
      .catch((error) => {
        setMessage(error.fieldErrors?.signature ?? error.message);
        setState('broken');
      });
  }, [complete, id, expires, signature, queryClient]);

  if (state === 'working') {
    return (
      <p role="status" className="text-center text-sm text-(--color-text-2)">
        {t('verify.working')}
      </p>
    );
  }

  if (state === 'done') {
    return (
      <div className="space-y-5 text-center">
        <p
          role="status"
          className="flex items-start gap-3 rounded-(--radius-control) bg-(--color-success-soft) px-4 py-3 text-start text-sm text-(--color-success)"
        >
          <Icon name="check" size={16} className="mt-1 shrink-0" />
          {t('verify.done')}
        </p>
        <Link href="/dashboard" className={SUBMIT}>
          {t('verify.continue')}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5 text-center">
      <p
        role="alert"
        className="flex items-start gap-3 rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-start text-sm text-(--color-danger)"
      >
        <Icon name="alert" size={16} className="mt-1 shrink-0" />
        {message ?? t('verify.incomplete')}
      </p>
      <p className="text-sm text-(--color-text-2)">{t('verify.askAgain')}</p>
      <p className="text-sm">
        <Link href="/login" className={LINK}>
          {t('reset.backToSignIn')}
        </Link>
      </p>
    </div>
  );
}
