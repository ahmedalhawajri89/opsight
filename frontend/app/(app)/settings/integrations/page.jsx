'use client';

import { useState } from 'react';
import Link from 'next/link';

import { useIntegrationActions, useIntegrations } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { SkeletonText } from '@/components/ui/Skeleton';
import { PageHeader } from '@/components/layout/PageHeader';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber } from '@/lib/format';

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
 * ZID IS THE OPPOSITE CASE, and gets one button. It runs a normal OAuth
 * redirect, so the owner approves in Zid and comes straight back — nothing to
 * copy, no deadline to state (ADR-037).
 *
 * The page reads top down as the owner's questions come: is anything
 * connected and working (the overview, then the stores themselves), and if
 * not, how do I connect one (the three sources, side by side, the one that
 * keeps itself current first). A connection card shows what an owner can act
 * on: whether the token can be renewed at all, and the provider's own words
 * when something has gone wrong. Never a token.
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
  const zidError = actions.connectZid.error;
  const zidBusy = actions.connectZid.isPending || actions.connectZid.isSuccess;

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
    <div className="space-y-6">
      <PageHeader title={t('integrations.title')} description={t('integrations.description')} />

      {!isLoading && !isError && integrations.length > 0 ? (
        <Overview integrations={integrations} />
      ) : null}

      <section aria-labelledby="stores-heading" className="space-y-3">
        <SectionHeading id="stores-heading" icon="link" title={t('integrations.yours')} />

        {isLoading ? (
          <div className="rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5">
            <SkeletonText lines={3} />
          </div>
        ) : isError ? (
          <ErrorState error={error} onRetry={refetch} />
        ) : integrations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-(--radius-card) border border-dashed border-(--color-line-strong) bg-(--color-ground) px-6 py-6 text-center sm:flex-row sm:text-start">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-(--color-brand-soft) text-(--color-brand-text)">
              <Icon name="store" size={24} />
            </span>
            <div>
              <p className="text-sm font-semibold text-(--color-text)">
                {t('integrations.empty.title')}
              </p>
              <p className="mt-1 text-sm text-(--color-text-2)">
                {t('integrations.empty.description')}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
            {integrations.map((integration) => (
              <ConnectionCard
                key={integration.id}
                integration={integration}
                onDisconnect={() => setDisconnecting(integration)}
              />
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="connect-heading" className="space-y-3">
        <SectionHeading id="connect-heading" icon="plus" title={t('integrations.connect')} />

        <div className="grid grid-cols-[minmax(0,1fr)] items-stretch gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {/* Zid: one button, an OAuth round trip. */}
          <SourceCard
            icon="store"
            title={t('integrations.zid.title')}
            tag={t('integrations.zid.tag')}
            tagIcon="bolt"
            description={t('integrations.zid.description')}
          >
            <ul className="space-y-2 text-sm text-(--color-text-2)">
              {['catalog', 'history', 'live'].map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-(--color-success)" />
                  {t(`integrations.zid.brings.${key}`)}
                </li>
              ))}
            </ul>

            <div className="mt-auto space-y-3 pt-5">
              {/*
                503 means this installation has no Zid app configured. Said in
                place of the button's result rather than as a generic error,
                because the owner can do nothing about it and should not retry.
              */}
              {zidError ? (
                <p
                  role="status"
                  className="flex items-start gap-2 rounded-(--radius-control) bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)"
                >
                  <Icon name="alert" size={14} className="mt-px shrink-0" />
                  {zidError.status === 503
                    ? t('integrations.zid.unavailable')
                    : t('integrations.zid.failed')}
                </p>
              ) : null}

              <Button
                variant="primary"
                className="w-full"
                onClick={() => actions.connectZid.mutate()}
                disabled={zidBusy}
              >
                <Icon name="link" size={16} />
                {zidBusy ? t('common.loading') : t('integrations.zid.action')}
              </Button>
            </div>
          </SourceCard>

          {/* Salla: install there, claim here, within the hour. */}
          <SourceCard
            icon="store"
            title={t('integrations.salla.title')}
            tag={t('integrations.salla.tag')}
            tagIcon="key"
          >
            {/*
              Numbered, because the order matters and one of the steps happens
              in a different application. A reader who does step three first
              finds nothing waiting and has no way to tell why.
            */}
            <ol className="relative space-y-3 text-sm text-(--color-text-2)">
              {['install', 'findId', 'claim'].map((key, index) => (
                <li key={key} className="relative flex items-start gap-3">
                  {index < 2 ? (
                    <span
                      aria-hidden="true"
                      className="absolute start-2.5 top-6 h-[calc(100%-0.75rem)] w-px bg-(--color-line-strong)"
                    />
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="tabular relative flex size-5 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-[11px] font-semibold text-(--color-brand-text)"
                  >
                    {formatNumber(index + 1)}
                  </span>
                  <span>{t(`integrations.steps.${key}`)}</span>
                </li>
              ))}
            </ol>

            {/*
              Said before it matters, not after. An hour is generous for
              someone doing this deliberately and short enough that the tokens
              are not left lying about.
            */}
            <p className="mt-4 flex items-start gap-2 rounded-(--radius-control) bg-(--color-warning-soft) px-3 py-2 text-xs leading-5 text-(--color-warning)">
              <Icon name="clock" size={14} className="mt-0.5 shrink-0" />
              <span>{t('integrations.deadline')}</span>
            </p>

            <form onSubmit={submit} className="mt-auto pt-4">
              <div className="flex items-start gap-2">
                <Field
                  label={t('integrations.storeId')}
                  hint={t('integrations.storeIdHint')}
                  error={claimError ? t('integrations.claimFailed') : null}
                  className="min-w-0 flex-1"
                >
                  {(field) => (
                    <Input
                      {...field}
                      value={storeId}
                      onChange={(event) => setStoreId(event.target.value)}
                      inputMode="numeric"
                      autoComplete="off"
                      dir="ltr"
                      placeholder="1305146709"
                    />
                  )}
                </Field>

                <Button
                  type="submit"
                  variant="primary"
                  className="mt-6 shrink-0"
                  disabled={actions.claim.isPending}
                >
                  {actions.claim.isPending ? t('common.loading') : t('integrations.claimAction')}
                </Button>
              </div>
            </form>
          </SourceCard>

          {/*
            For the merchant whose "store" is WhatsApp and a workbook. Last of
            the three because a connected store keeps itself current and a
            file does not — the better option is offered first.
          */}
          <SourceCard
            icon="table"
            title={t('integrations.file.name')}
            tag={t('integrations.file.tag')}
            tagIcon="upload"
            description={t('integrations.file.description')}
            className="lg:col-span-2 2xl:col-span-1"
          >
            <ul className="space-y-2 text-sm text-(--color-text-2)">
              {['formats', 'kinds', 'check'].map((key) => (
                <li key={key} className="flex items-start gap-2">
                  <Icon name="check" size={16} className="mt-0.5 shrink-0 text-(--color-success)" />
                  {t(`integrations.file.points.${key}`)}
                </li>
              ))}
            </ul>

            <div className="mt-auto pt-5">
              <Link
                href="/settings/integrations/import"
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-(--radius-control) border border-(--color-line-strong) bg-(--color-surface) px-4 text-sm font-medium text-(--color-text) transition-colors hover:bg-(--color-surface-selected) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
              >
                <Icon name="upload" size={16} />
                {t('integrations.file.action')}
              </Link>
            </div>
          </SourceCard>
        </div>
      </section>

      {/*
        What an owner worries about before connecting anything: will it
        change my store, and can I undo it. Answered once, at the foot.
      */}
      <ul className="grid gap-3 rounded-(--radius-card) border border-(--color-line) bg-(--color-ground) p-4 text-xs leading-5 text-(--color-text-2) md:grid-cols-3">
        {[
          ['repeat', 'live'],
          ['shield', 'keep'],
          ['lock', 'owner'],
        ].map(([icon, key]) => (
          <li key={key} className="flex items-start gap-2.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-(--color-surface) text-(--color-brand-text) ring-1 ring-(--color-line)">
              <Icon name={icon} size={15} />
            </span>
            <span className="pt-1">{t(`integrations.assurance.${key}`)}</span>
          </li>
        ))}
      </ul>

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

function SectionHeading({ id, icon, title }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-sm font-semibold text-(--color-text)">
      <Icon name={icon} size={16} className="text-(--color-brand-text)" />
      {title}
    </h2>
  );
}

/**
 * Three figures an owner checks first: how many stores, when anything last
 * arrived, and whether any connection needs them. Read from the list itself.
 */
function Overview({ integrations }) {
  const { t } = useI18n();

  const working = integrations.filter((item) => item.status === 'connected').length;
  const attention = integrations.filter(
    (item) => item.status !== 'connected' || item.last_error || !item.can_refresh,
  ).length;
  const lastSync = integrations
    .map((item) => item.last_synced_at)
    .filter(Boolean)
    .sort()
    .at(-1);

  const health =
    integrations.length === 0
      ? { tone: 'neutral', icon: 'link', text: t('integrations.overview.none') }
      : attention > 0
        ? {
            tone: 'warning',
            icon: 'alert',
            text: t('integrations.overview.attention', { count: formatNumber(attention) }),
          }
        : { tone: 'positive', icon: 'check', text: t('integrations.overview.healthy') };

  const tones = {
    neutral: 'bg-(--color-surface-selected) text-(--color-text-2)',
    warning: 'bg-(--color-warning-soft) text-(--color-warning)',
    positive: 'bg-(--color-success-soft) text-(--color-success)',
  };

  const tiles = [
    {
      icon: 'store',
      label: t('integrations.overview.connected'),
      value: formatNumber(working),
      tone: 'bg-(--color-brand-soft) text-(--color-brand-text)',
    },
    {
      icon: 'repeat',
      label: t('integrations.lastSynced'),
      value: lastSync ? formatDateTime(lastSync) : t('integrations.neverSynced'),
      tone: 'bg-(--color-brand-soft) text-(--color-brand-text)',
    },
    {
      icon: health.icon,
      label: t('integrations.overview.health'),
      value: health.text,
      tone: tones[health.tone],
    },
  ];

  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className="flex items-center gap-3 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4"
        >
          <span
            className={cn(
              'flex size-10 shrink-0 items-center justify-center rounded-xl',
              tile.tone,
            )}
          >
            <Icon name={tile.icon} size={20} />
          </span>
          <div className="min-w-0">
            <dt className="text-xs text-(--color-text-2)">{tile.label}</dt>
            <dd className="mt-0.5 truncate text-sm font-semibold text-(--color-text)">
              {tile.value}
            </dd>
          </div>
        </div>
      ))}
    </dl>
  );
}

/** One way in: what it is, how it works, and its action pinned to the foot. */
function SourceCard({ icon, title, tag, tagIcon, description, className, children }) {
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5 transition-shadow duration-(--duration-base) hover:shadow-sm',
        className,
      )}
    >
      <header className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--color-brand-soft) text-(--color-brand-text)">
          <Icon name={icon} size={22} />
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-(--color-text)">{title}</h3>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-(--color-brand-text)">
            <Icon name={tagIcon} size={12} />
            {tag}
          </p>
        </div>
      </header>

      {description ? (
        <p className="mt-4 text-sm leading-6 text-(--color-text-2)">{description}</p>
      ) : null}

      <div className={cn('flex flex-1 flex-col', description ? 'mt-4' : 'mt-5')}>{children}</div>
    </article>
  );
}

function ConnectionCard({ integration, onDisconnect }) {
  const { t } = useI18n();
  const tone = STATUS_TONE[integration.status] ?? 'neutral';

  return (
    <article
      className={cn(
        'min-w-0 rounded-(--radius-card) border bg-(--color-surface) p-5',
        tone === 'positive' ? 'border-(--color-line)' : 'border-(--color-warning)',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--color-brand-soft) text-(--color-brand-text)">
            <Icon name="store" size={22} />
            <span
              aria-hidden="true"
              className={cn(
                'absolute -end-0.5 -bottom-0.5 size-3 rounded-full ring-2 ring-(--color-surface)',
                tone === 'positive'
                  ? 'bg-(--color-success)'
                  : tone === 'warning'
                    ? 'bg-(--color-warning)'
                    : 'bg-(--color-danger)',
              )}
            />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-semibold text-(--color-text)">
                {t(`integrations.providers.${integration.provider}`)}
              </h3>
              <Badge tone={tone} dot>
                {t(`integrations.status.${integration.status}`)}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-(--color-muted)">
              {t('integrations.storeLabel', { id: integration.store_id })}
            </p>
          </div>
        </div>

        <Button variant="ghost" size="sm" onClick={onDisconnect}>
          <Icon name="ban" size={14} />
          {t('integrations.disconnect')}
        </Button>
      </div>

      <dl className="mt-4 grid gap-3 border-t border-(--color-line-subtle) pt-4 text-xs sm:grid-cols-3">
        <Meta icon="calendar" label={t('integrations.connectedAt')}>
          {formatDateTime(integration.connected_at)}
        </Meta>
        <Meta icon="repeat" label={t('integrations.lastSynced')}>
          {integration.last_synced_at
            ? formatDateTime(integration.last_synced_at)
            : t('integrations.neverSynced')}
        </Meta>
        <Meta icon="key" label={t('integrations.renewal')} warn={!integration.can_refresh}>
          {integration.can_refresh ? t('integrations.renews') : t('integrations.cannotRenew')}
        </Meta>
      </dl>

      {/*
        The provider's own words, not ours. An integration that has stopped
        working is a support conversation, and "it failed" is not a
        conversation.
      */}
      {integration.last_error ? (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-(--radius-control) bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)"
        >
          <Icon name="alert" size={14} className="mt-px shrink-0" />
          <bdi>{integration.last_error}</bdi>
        </p>
      ) : null}
    </article>
  );
}

function Meta({ icon, label, warn = false, children }) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} size={14} className="mt-0.5 shrink-0 text-(--color-muted)" />
      <div className="min-w-0">
        <dt className="text-(--color-muted)">{label}</dt>
        <dd
          className={cn(
            'mt-0.5 font-medium',
            warn ? 'text-(--color-warning)' : 'text-(--color-text)',
          )}
        >
          {children}
        </dd>
      </div>
    </div>
  );
}
