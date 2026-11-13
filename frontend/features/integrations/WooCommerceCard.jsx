'use client';

import { useState } from 'react';

import { PlatformLogo } from '@/components/brand/PlatformLogo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useIntegrationActions } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatNumber } from '@/lib/format';

/**
 * Connecting a WooCommerce store with a REST key made in it.
 *
 * Nothing to wait for and nobody to approve, so it is always ready: the
 * three steps say where the key is made in WordPress, and the store answers
 * at once whether the key works. Its refusal is shown beside the field it
 * concerns, in the owner's language (the server words it).
 */
export function WooCommerceCard() {
  const { t } = useI18n();
  const { connectWooCommerce } = useIntegrationActions();
  const [form, setForm] = useState({ url: '', consumer_key: '', consumer_secret: '' });
  const errors = connectWooCommerce.error?.errors ?? {};
  const error = connectWooCommerce.error;
  // A refusal that names no field (another business holds the store, or the
  // server failed) is said above the form; a field's own refusal sits by it.
  const general = error && Object.keys(error.errors ?? {}).length === 0 ? error.message : null;

  function submit(event) {
    event.preventDefault();
    connectWooCommerce.mutate(
      {
        url: form.url.trim(),
        consumer_key: form.consumer_key.trim(),
        consumer_secret: form.consumer_secret.trim(),
      },
      { onSuccess: () => setForm({ url: '', consumer_key: '', consumer_secret: '' }) },
    );
  }

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  return (
    <article className="flex min-w-0 flex-col rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5 transition-[box-shadow,border-color] duration-(--duration-base) hover:border-(--color-border) hover:shadow-(--shadow-card)">
      <header className="flex items-start gap-3">
        <PlatformLogo platform="woocommerce" size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-(--color-text)">
            {t('integrations.platforms.woocommerce')}
          </h3>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-(--color-brand-text)">
            <Icon name="key" size={12} />
            {t('integrations.woocommerce.tag')}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-(--radius-pill) bg-(--color-success-soft) px-2.5 py-1 text-[0.6875rem] font-semibold text-(--color-success)">
          <Icon name="check" size={12} />
          {t('integrations.readiness.ready')}
        </span>
      </header>

      <p className="mt-4 text-sm leading-6 text-(--color-text-2)">
        {t('integrations.woocommerce.description')}
      </p>

      <ol className="mt-4 space-y-2.5 text-sm text-(--color-text-2)">
        {['open', 'add', 'paste'].map((key, index) => (
          <li key={key} className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-[11px] font-semibold text-(--color-brand-text)"
            >
              {formatNumber(index + 1)}
            </span>
            <span>{t(`integrations.woocommerce.steps.${key}`)}</span>
          </li>
        ))}
      </ol>

      {connectWooCommerce.isSuccess ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-(--radius-control) bg-(--color-success-soft) px-3 py-2 text-xs leading-5 text-(--color-success)"
        >
          <Icon name="check" size={14} className="mt-0.5 shrink-0" />
          {t('integrations.woocommerce.connected')}
        </p>
      ) : null}

      {general ? (
        <p
          role="alert"
          className="mt-4 flex items-start gap-2 rounded-(--radius-control) bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)"
        >
          <Icon name="alert" size={14} className="mt-0.5 shrink-0" />
          {general}
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-auto space-y-3 pt-5">
        <Field
          label={t('integrations.woocommerce.url')}
          hint={t('integrations.woocommerce.urlHint')}
          error={errors.url?.[0]}
        >
          {(field) => (
            <Input
              {...field}
              type="url"
              dir="ltr"
              value={form.url}
              onChange={set('url')}
              placeholder="https://mystore.com"
              autoComplete="url"
              required
            />
          )}
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('integrations.woocommerce.key')} error={errors.consumer_key?.[0]}>
            {(field) => (
              <Input
                {...field}
                dir="ltr"
                value={form.consumer_key}
                onChange={set('consumer_key')}
                placeholder="ck_…"
                autoComplete="off"
                spellCheck={false}
                required
              />
            )}
          </Field>
          <Field
            label={t('integrations.woocommerce.secret')}
            hint={t('integrations.woocommerce.secretHint')}
            error={errors.consumer_secret?.[0]}
          >
            {(field) => (
              <Input
                {...field}
                type="password"
                dir="ltr"
                value={form.consumer_secret}
                onChange={set('consumer_secret')}
                placeholder="cs_…"
                autoComplete="off"
                required
              />
            )}
          </Field>
        </div>
        <Button
          type="submit"
          variant="primary"
          className="w-full"
          disabled={connectWooCommerce.isPending}
        >
          <Icon name="link" size={16} />
          {connectWooCommerce.isPending
            ? t('common.loading')
            : t('integrations.woocommerce.action')}
        </Button>
      </form>
    </article>
  );
}
