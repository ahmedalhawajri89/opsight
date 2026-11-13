'use client';

import { useEffect, useId, useState } from 'react';

import { PlatformLogo } from '@/components/brand/PlatformLogo';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useApiKeys } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatRelative } from '@/lib/format';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8010';
const ENDPOINT = `${API_URL}/api/v1/inbound/orders`;

/** The platforms the universal connection already reaches, through themselves or a tool. */
const WORKS_WITH = ['shopify', 'woocommerce', 'zapier', 'make', 'n8n'];

const EXAMPLE = `{
  "id": "WOO-1001",
  "placed_at": "2026-11-13T10:30:00+03:00",
  "status": "fulfilled",
  "customer": { "name": "Sara Ali", "email": "sara@example.com" },
  "lines": [
    { "sku": "MUG-1", "name": "Mug", "quantity": 2, "unit_price": 4.5 }
  ],
  "shipping": 2,
  "paid": 11,
  "payment_method": "card"
}`;

/**
 * The universal connection: one key per system that sends orders in.
 *
 * For the store or system that has no Baydar app, which is most of them.
 * The owner names the system, gets a key once, and pastes it where the
 * orders come from: a WooCommerce webhook, a Shopify flow, a Zapier or Make
 * step, a till's export, their own code. The key is shown in full only in
 * the answer that made it; after that the list shows its prefix, when it was
 * last used and how many orders it has brought in.
 */
export function UniversalConnection() {
  const { t } = useI18n();
  const id = useId();
  const { keys, query, create, revoke } = useApiKeys();
  const [name, setName] = useState('');
  const [secret, setSecret] = useState(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(null);

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 1800);

    return () => clearTimeout(timer);
  }, [copied]);

  function submit(event) {
    event.preventDefault();
    const trimmed = name.trim();

    if (trimmed === '') return;

    create.mutate(
      { name: trimmed },
      {
        onSuccess: (response) => {
          setSecret(response?.data?.secret ?? null);
          setName('');
        },
      },
    );
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // The key stays selectable when the clipboard is refused.
    }
  }

  return (
    <article className="flex min-w-0 flex-col gap-5 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <PlatformLogo platform="api" size={44}>
            <Icon name="key" size={22} />
          </PlatformLogo>
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-(--color-text)">
              {t('integrations.api.title')}
            </h3>
            <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-(--color-brand-text)">
              <Icon name="globe" size={12} />
              {t('integrations.api.tag')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-(--color-text-2)">{t('integrations.api.works')}</span>
          <ul className="flex -space-x-1.5 rtl:space-x-reverse">
            {WORKS_WITH.map((platform) => (
              <li
                key={platform}
                title={platform}
                className="rounded-xl ring-2 ring-(--color-surface)"
              >
                <PlatformLogo platform={platform} size={30} className="rounded-[9px]" />
              </li>
            ))}
          </ul>
        </div>
      </header>

      <p className="text-sm leading-6 text-(--color-text-2)">{t('integrations.api.description')}</p>

      {secret ? (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-(--radius-panel) border border-(--color-success) bg-(--color-success-soft) p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-(--color-success)">
            <Icon name="check" size={16} />
            {t('integrations.api.createdTitle')}
          </p>
          <p className="text-xs leading-5 text-(--color-text-2)">
            {t('integrations.api.createdBody')}
          </p>
          <div className="flex items-center gap-2">
            <code
              dir="ltr"
              className="min-w-0 flex-1 truncate rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-3 py-2 font-mono text-xs text-(--color-text) select-all"
            >
              {secret}
            </code>
            <Button variant="secondary" size="sm" onClick={() => copy(secret)}>
              <Icon name={copied ? 'check' : 'copy'} size={14} />
              {copied ? t('integrations.api.copied') : t('integrations.api.copy')}
            </Button>
          </div>
          <Button
            variant="primary"
            size="sm"
            className="self-start"
            onClick={() => setSecret(null)}
          >
            {t('integrations.api.done')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex items-start gap-2">
          <Field
            label={t('integrations.api.name')}
            hint={t('integrations.api.nameHint')}
            error={create.error?.errors?.name?.[0] ?? (create.error ? create.error.message : null)}
            className="min-w-0 flex-1"
          >
            {(field) => (
              <Input
                {...field}
                value={name}
                maxLength={80}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('integrations.api.namePlaceholder')}
              />
            )}
          </Field>
          <Button
            type="submit"
            variant="primary"
            className="mt-6 shrink-0"
            disabled={create.isPending}
          >
            <Icon name="plus" size={15} />
            {create.isPending ? t('common.loading') : t('integrations.api.create')}
          </Button>
        </form>
      )}

      <section aria-labelledby={`${id}-keys`} className="flex flex-col gap-2">
        <h4 id={`${id}-keys`} className="text-xs font-semibold text-(--color-text-2)">
          {t('integrations.api.keys')}
        </h4>
        {query.isLoading ? (
          <div className="skeleton h-14 rounded-(--radius-panel)" />
        ) : keys.length === 0 ? (
          <p className="rounded-(--radius-panel) border border-dashed border-(--color-line-strong) px-4 py-3 text-xs text-(--color-text-2)">
            {t('integrations.api.noKeys')}
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-(--color-line-subtle) rounded-(--radius-panel) border border-(--color-line)">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-semibold text-(--color-text)" dir="auto">
                    {key.name}
                  </span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-(--color-text-2)">
                    <code dir="ltr" className="font-mono">
                      {key.prefix}_••••
                    </code>
                    <span>
                      {key.last_used_at
                        ? t('integrations.api.lastUsed', { time: formatRelative(key.last_used_at) })
                        : t('integrations.api.neverUsed')}
                    </span>
                    <span>{t('integrations.api.received', { count: key.orders_received })}</span>
                  </span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => setRevoking(key)}>
                  <Icon name="ban" size={14} />
                  {t('integrations.api.revoke')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details className="group rounded-(--radius-panel) border border-(--color-line) bg-(--color-surface-subtle)">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-semibold text-(--color-text)">
          {t('integrations.api.how')}
          <Icon
            name="chevronDown"
            size={16}
            className="transition-transform duration-200 group-open:rotate-180"
          />
        </summary>
        <div className="flex flex-col gap-3 border-t border-(--color-line-subtle) px-4 py-3 text-xs">
          <Row label={t('integrations.api.endpoint')}>
            <code dir="ltr" className="font-mono">
              POST {ENDPOINT}
            </code>
          </Row>
          <Row label={t('integrations.api.header')}>
            <code dir="ltr" className="font-mono">
              Authorization: Bearer bydr_…
            </code>
          </Row>
          <div className="flex flex-col gap-1.5">
            <span className="text-(--color-text-2)">{t('integrations.api.example')}</span>
            <pre
              dir="ltr"
              className="overflow-x-auto rounded-(--radius-control) bg-(--color-brand-panel) p-3 font-mono text-[0.6875rem] leading-5 text-(--color-on-brand)"
            >
              {EXAMPLE}
            </pre>
          </div>
          <p className="flex items-start gap-1.5 text-(--color-text-2)">
            <Icon name="repeat" size={13} className="mt-0.5 shrink-0" />
            {t('integrations.api.sameId')}
          </p>
        </div>
      </details>

      <ConfirmDialog
        open={revoking !== null}
        title={t('integrations.api.confirmTitle')}
        consequence={t('integrations.api.confirmConsequence')}
        confirmLabel={t('integrations.api.revoke')}
        loading={revoke.isPending}
        onConfirm={() => {
          revoke.mutate(revoking.id);
          setRevoking(null);
        }}
        onClose={() => setRevoking(null)}
      />
    </article>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-(--color-text-2)">{label}</span>
      <span className="overflow-x-auto rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-3 py-2 text-(--color-text)">
        {children}
      </span>
    </div>
  );
}
