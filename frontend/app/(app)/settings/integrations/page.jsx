'use client';

import { useState } from 'react';

import { useIntegrationActions, useIntegrations } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/data/States';
import { SkeletonText } from '@/components/ui/Skeleton';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { formatDateTime } from '@/lib/format';

/**
 * The stores this business has connected.
 *
 * THE SCREEN HAS TO EXPLAIN A FLOW IT DOES NOT CONTROL. Salla's Easy mode
 * gives an app no way to know which of its own accounts an installation
 * belongs to, so the merchant installs in Salla and then comes here to say
 * which store was theirs. From the owner's side that is two places and an
 * hour's deadline, and a screen that offered only a text box would leave
 * them to work that out.
 *
 * So the instructions are on the screen, in order, with the deadline stated
 * before it matters rather than after it has passed.
 *
 * The connection card shows what an owner can act on: whether the token can
 * be renewed at all (it cannot, if the app was installed without offline
 * access, and the connection will simply stop in a fortnight), and the
 * provider's own words when something has gone wrong. Never a token.
 */

const STATUS_TONE = {
  connected: 'positive',
  expired: 'warning',
  revoked: 'negative',
  error: 'negative',
};

export default function IntegrationsPage() {
  const { t } = useI18n();
  const { integrations, isLoading, isError, error, refetch } = useIntegrations();
  const actions = useIntegrationActions();

  const [storeId, setStoreId] = useState('');
  const [disconnecting, setDisconnecting] = useState(null);

  if (isError && error?.isForbidden) {
    return <ForbiddenState />;
  }

  const claimError = actions.claim.error;

  function submit(event) {
    event.preventDefault();

    const trimmed = storeId.trim();

    if (trimmed === '') return;

    actions.claim.mutate(
      { provider: 'salla', store_id: trimmed },
      { onSuccess: () => setStoreId('') },
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t('integrations.title')} description={t('integrations.description')} />

      <Card>
        <h2 className="text-sm font-semibold text-(--color-text)">{t('integrations.connect')}</h2>

        {/*
          Numbered, because the order matters and one of the steps happens in
          a different application. A reader who does step three first finds
          nothing waiting and has no way to tell why.
        */}
        <ol className="measure mt-3 space-y-2 text-sm text-(--color-text-2)">
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-semibold text-(--color-text-3)">
              1.
            </span>
            <span>{t('integrations.steps.install')}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-semibold text-(--color-text-3)">
              2.
            </span>
            <span>{t('integrations.steps.findId')}</span>
          </li>
          <li className="flex gap-2">
            <span aria-hidden="true" className="font-semibold text-(--color-text-3)">
              3.
            </span>
            <span>{t('integrations.steps.claim')}</span>
          </li>
        </ol>

        {/*
          Said before it matters, not after. An hour is generous for someone
          doing this deliberately and short enough that the tokens are not
          left lying about; a reader who learns of it from a failure learns
          the wrong lesson about the application.
        */}
        <p className="mt-3 flex items-start gap-2 text-xs text-(--color-text-3)">
          <Icon name="clock" size={14} aria-hidden="true" className="mt-px shrink-0" />
          <span className="measure">{t('integrations.deadline')}</span>
        </p>

        <form onSubmit={submit} className="mt-4 flex flex-wrap items-end gap-3">
          <Field
            label={t('integrations.storeId')}
            hint={t('integrations.storeIdHint')}
            error={claimError ? t('integrations.claimFailed') : null}
            className="min-w-[16rem] flex-1"
          >
            {(field) => (
              <Input
                {...field}
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
                inputMode="numeric"
                autoComplete="off"
                placeholder="1305146709"
              />
            )}
          </Field>

          <Button type="submit" variant="primary" disabled={actions.claim.isPending}>
            {actions.claim.isPending ? t('common.loading') : t('integrations.claimAction')}
          </Button>
        </form>
      </Card>

      {isLoading ? (
        <Card>
          <SkeletonText lines={3} />
        </Card>
      ) : isError ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : integrations.length === 0 ? (
        <EmptyState
          title={t('integrations.empty.title')}
          description={t('integrations.empty.description')}
        />
      ) : (
        <div className="space-y-3">
          {integrations.map((integration) => (
            <Card key={integration.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Icon name="link" size={16} aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-(--color-text)">
                      {t(`integrations.providers.${integration.provider}`)}
                    </h3>
                    <Badge tone={STATUS_TONE[integration.status] ?? 'neutral'}>
                      {t(`integrations.status.${integration.status}`)}
                    </Badge>
                  </div>

                  <p className="mt-1 text-xs text-(--color-text-3)">
                    {t('integrations.storeLabel', { id: integration.store_id })}
                  </p>
                </div>

                <Button variant="ghost" size="sm" onClick={() => setDisconnecting(integration)}>
                  {t('integrations.disconnect')}
                </Button>
              </div>

              <dl className="mt-3 grid gap-3 text-xs sm:grid-cols-3">
                <div>
                  <dt className="text-(--color-text-3)">{t('integrations.connectedAt')}</dt>
                  <dd className="mt-0.5 text-(--color-text-2)">
                    {formatDateTime(integration.connected_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--color-text-3)">{t('integrations.lastSynced')}</dt>
                  <dd className="mt-0.5 text-(--color-text-2)">
                    {integration.last_synced_at
                      ? formatDateTime(integration.last_synced_at)
                      : t('integrations.neverSynced')}
                  </dd>
                </div>
                <div>
                  <dt className="text-(--color-text-3)">{t('integrations.renewal')}</dt>
                  <dd className="mt-0.5 text-(--color-text-2)">
                    {integration.can_refresh
                      ? t('integrations.renews')
                      : t('integrations.cannotRenew')}
                  </dd>
                </div>
              </dl>

              {/*
                The provider's own words, not ours. An integration that has
                stopped working is a support conversation, and "it failed" is
                not a conversation.
              */}
              {integration.last_error ? (
                <p
                  role="status"
                  className="measure mt-3 rounded-(--radius-control) bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger-text)"
                >
                  {integration.last_error}
                </p>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={disconnecting !== null}
        title={t('integrations.confirm.title')}
        /*
          Stated both ways: what stops, and what stays. An owner who fears
          their order history will go with the connection will never
          disconnect a store they claimed by mistake.
        */
        consequence={t('integrations.confirm.consequence')}
        confirmLabel={t('integrations.disconnect')}
        loading={actions.disconnect.isPending}
        onConfirm={() => {
          actions.disconnect.mutate(disconnecting.id);
          setDisconnecting(null);
        }}
        onClose={() => setDisconnecting(null)}
      />
    </div>
  );
}
