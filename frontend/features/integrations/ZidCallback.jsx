'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useIntegrationActions } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';

/**
 * Finishing a Zid connection: hands Zid's code and our state to the API once,
 * then says plainly what happened.
 *
 * ONCE, AND THAT IS ENFORCED HERE AS WELL AS ON THE SERVER. React runs an
 * effect twice in development, and the state is single-use: a second POST
 * would be refused and the screen would report a failure for a connection
 * that had just succeeded. The ref keeps it to one request per page load.
 *
 * Three outcomes, each in words an owner can act on: connected, cancelled in
 * Zid (`error` in the query, no code), or refused — with the server's own
 * message, which already says whether to start again or disconnect elsewhere.
 */
export function ZidCallback() {
  const { t } = useI18n();
  const params = useSearchParams();
  const { completeZid } = useIntegrationActions();
  const sent = useRef(false);

  const code = params.get('code');
  const state = params.get('state');
  const declined = !code || !state;

  useEffect(() => {
    if (declined || sent.current) return;

    sent.current = true;
    completeZid.mutate({ code, state });
    // completeZid is stable for the life of the page; the ref is the guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, state, declined]);

  let tone = 'neutral';
  let message = t('integrations.zid.connecting');

  if (declined) {
    tone = 'warning';
    message = t('integrations.zid.declined');
  } else if (completeZid.isSuccess) {
    tone = 'positive';
    message = t('integrations.zid.connected');
  } else if (completeZid.isError) {
    tone = 'negative';
    message = completeZid.error?.message || t('integrations.zid.failed');
  }

  const icon = { positive: 'check', negative: 'alert', warning: 'alert', neutral: 'clock' }[tone];
  const color = {
    positive: 'text-(--color-success)',
    negative: 'text-(--color-danger)',
    warning: 'text-(--color-warning)',
    neutral: 'text-(--color-text-2)',
  }[tone];

  return (
    <div className="space-y-5">
      <PageHeader title={t('integrations.zid.title')} />

      <Card>
        <p role="status" aria-live="polite" className={`measure flex items-start gap-2 text-sm ${color}`}>
          <Icon name={icon} size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>{message}</span>
        </p>

        {completeZid.isPending ? null : (
          <Link
            href="/settings/integrations"
            className="mt-4 inline-block text-sm font-medium text-(--color-accent-strong) underline-offset-4 hover:underline"
          >
            {t('integrations.zid.back')}
          </Link>
        )}
      </Card>
    </div>
  );
}
