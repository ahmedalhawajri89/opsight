'use client';

import { useState } from 'react';

import { PlatformLogo } from '@/components/brand/PlatformLogo';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useIntegrationActions } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';

/**
 * Connecting a Shopify store, two ways (ConnectShopifyStore on the server):
 * through Baydar's own Shopify app, which needs that app set up on this
 * installation, or with an Admin API token from a custom app the owner made
 * before 2026. The second is behind a disclosure: most owners will never
 * have one, and the field would only confuse them.
 */
export function ShopifyCard({ available }) {
  const { t } = useI18n();
  const { connectShopify, connectShopifyToken } = useIntegrationActions();
  const [shop, setShop] = useState('');
  const [token, setToken] = useState('');
  const [withToken, setWithToken] = useState(false);

  const error = withToken ? connectShopifyToken.error : connectShopify.error;
  const errors = error?.errors ?? {};
  const general = error && Object.keys(errors).length === 0 ? error.message : null;
  const busy =
    connectShopify.isPending || connectShopify.isSuccess || connectShopifyToken.isPending;

  function submit(event) {
    event.preventDefault();

    if (withToken) {
      connectShopifyToken.mutate(
        { shop: shop.trim(), token: token.trim() },
        {
          onSuccess: () => {
            setShop('');
            setToken('');
          },
        },
      );
    } else {
      connectShopify.mutate({ shop: shop.trim() });
    }
  }

  const ready = available || withToken;

  return (
    <article className="flex min-w-0 flex-col rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5 transition-[box-shadow,border-color] duration-(--duration-base) hover:border-(--color-border) hover:shadow-(--shadow-card)">
      <header className="flex items-start gap-3">
        <PlatformLogo platform="shopify" size={44} />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold text-(--color-text)">
            {t('integrations.platforms.shopify')}
          </h3>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-(--color-brand-text)">
            <Icon name="bolt" size={12} />
            {t('integrations.shopify.tag')}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-(--radius-pill) px-2.5 py-1 text-[0.6875rem] font-semibold',
            available
              ? 'bg-(--color-success-soft) text-(--color-success)'
              : 'bg-(--color-warning-soft) text-(--color-warning)',
          )}
        >
          <Icon name={available ? 'check' : 'clock'} size={12} />
          {available ? t('integrations.readiness.ready') : t('integrations.readiness.setup')}
        </span>
      </header>

      <p className="mt-4 text-sm leading-6 text-(--color-text-2)">
        {t('integrations.shopify.description')}
      </p>

      <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-(--color-text-2)">
        <Icon name="info" size={13} className="mt-0.5 shrink-0" />
        {t('integrations.shopify.customers')}
      </p>

      {!available && !withToken ? (
        <p className="mt-4 flex items-start gap-2 rounded-(--radius-control) bg-(--color-warning-soft) px-3 py-2 text-xs leading-5 text-(--color-warning)">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          <span>
            {t('integrations.readiness.setupHint', {
              platform: t('integrations.platforms.shopify'),
            })}
          </span>
        </p>
      ) : null}

      {connectShopifyToken.isSuccess ? (
        <p
          role="status"
          className="mt-4 flex items-start gap-2 rounded-(--radius-control) bg-(--color-success-soft) px-3 py-2 text-xs leading-5 text-(--color-success)"
        >
          <Icon name="check" size={14} className="mt-0.5 shrink-0" />
          {t('integrations.shopify.connected')}
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
          label={t('integrations.shopify.shop')}
          hint={t('integrations.shopify.shopHint')}
          error={errors.shop?.[0] ?? errors.state?.[0]}
        >
          {(field) => (
            <Input
              {...field}
              dir="ltr"
              value={shop}
              onChange={(event) => setShop(event.target.value)}
              placeholder="mystore.myshopify.com"
              autoComplete="off"
              spellCheck={false}
              required
            />
          )}
        </Field>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-(--color-text-2)">
          <input
            type="checkbox"
            checked={withToken}
            onChange={(event) => setWithToken(event.target.checked)}
            className="size-4 accent-(--color-brand)"
          />
          {t('integrations.shopify.haveToken')}
        </label>

        {withToken ? (
          <div className="space-y-2 rounded-(--radius-panel) border border-(--color-line) bg-(--color-surface-subtle) p-3">
            <p className="text-xs leading-5 text-(--color-text-2)">
              {t('integrations.shopify.tokenNote')}
            </p>
            <Field
              label={t('integrations.shopify.token')}
              hint={t('integrations.shopify.tokenHint')}
              error={errors.token?.[0]}
            >
              {(field) => (
                <Input
                  {...field}
                  type="password"
                  dir="ltr"
                  value={token}
                  onChange={(event) => setToken(event.target.value)}
                  placeholder="shpat_…"
                  autoComplete="off"
                  required
                />
              )}
            </Field>
          </div>
        ) : null}

        <Button type="submit" variant="primary" className="w-full" disabled={busy || !ready}>
          <Icon name={withToken ? 'key' : 'link'} size={16} />
          {busy
            ? t('common.loading')
            : withToken
              ? t('integrations.shopify.tokenAction')
              : t('integrations.shopify.action')}
        </Button>
      </form>
    </article>
  );
}
