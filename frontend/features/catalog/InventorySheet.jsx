'use client';

import Link from 'next/link';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Can } from '@/features/auth/Can';
import { useMovements } from '@/features/catalog/useCatalog';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DetailHero, DetailList, DetailSection, DetailSheet } from '@/components/ui/DetailSheet';
import { SkeletonText } from '@/components/ui/Skeleton';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';

/** How many of the latest movements the panel shows; the rest are a page away. */
const RECENT = 8;

/**
 * One stock line, read without leaving the list (DetailSheet).
 *
 * The figure, its status, the level it is reordered at — and the last few
 * movements that made the figure what it is. Stock on hand is a cache over an
 * append-only ledger; showing the ledger beside the number is what lets an
 * owner trust the number, or see exactly where it went wrong.
 */
export function InventorySheet({ item, onClose, onAdjust }) {
  const { t } = useI18n();
  const productId = item?.product_id ?? null;
  const { movements, isLoading } = useMovements(productId, { per_page: RECENT });

  const out = item ? item.stock_on_hand <= 0 : false;
  const status = !item ? null : out ? 'out' : item.is_low ? 'low' : 'ok';
  const tone = { out: 'danger', low: 'warning', ok: 'success' }[status] ?? 'neutral';
  const badgeTone = { out: 'negative', low: 'warning', ok: 'positive' }[status] ?? 'neutral';
  const unit = item?.product?.unit;

  return (
    <DetailSheet
      open={item !== null}
      onClose={onClose}
      title={item?.product?.display_name ?? item?.product?.name ?? ''}
      subtitle={item?.product?.sku}
      hero={
        item ? (
          <DetailHero
            tone={tone}
            label={t('inventory.columns.onHand')}
            value={
              unit
                ? `${formatNumber(item.stock_on_hand)} ${unit}`
                : formatNumber(item.stock_on_hand)
            }
            badge={<Badge tone={badgeTone}>{t(`inventory.sheet.status.${status}`)}</Badge>}
            note={t('inventory.sheet.reorderNote', { level: formatNumber(item.threshold) })}
          />
        ) : null
      }
      footer={
        <>
          {item ? (
            <Link
              href={`/products?search=${encodeURIComponent(item.product?.sku ?? '')}`}
              className="text-sm text-(--color-accent-strong) underline-offset-4 hover:underline"
            >
              {t('inventory.sheet.openProduct')}
            </Link>
          ) : null}
          <Can ability="inventory.adjust">
            <Button variant="primary" onClick={() => onAdjust(item)}>
              {t('inventory.adjust')}
            </Button>
          </Can>
        </>
      }
    >
      {item ? (
        <>
          <DetailSection title={t('inventory.sheet.details')}>
            <DetailList
              items={[
                { label: t('inventory.columns.reorderAt'), value: formatNumber(item.threshold) },
                {
                  label: t('inventory.columns.lastMovement'),
                  value: item.last_movement_at ? (
                    <span title={formatDateTime(item.last_movement_at)}>
                      {formatRelative(item.last_movement_at)}
                    </span>
                  ) : null,
                },
              ]}
            />
          </DetailSection>

          <DetailSection title={t('inventory.sheet.movements')}>
            {isLoading ? (
              <SkeletonText lines={4} />
            ) : movements.length === 0 ? (
              <p className="text-sm text-(--color-muted)">{t('inventory.columns.neverMoved')}</p>
            ) : (
              /*
                A timeline: each movement a dot on a line, newest first, the
                change in its own colour and the balance it left. Read top to
                bottom it is the story of how the shelf got to today.
              */
              <ol className="relative space-y-3 border-s border-(--border-subtle) ps-4">
                {movements.map((movement) => {
                  const delta = Number(movement.quantity_delta);

                  return (
                    <li key={movement.id} className="relative">
                      <span
                        aria-hidden="true"
                        className={`absolute -start-[1.3rem] top-1.5 size-2.5 rounded-full ring-4 ring-(--color-surface) ${
                          delta >= 0 ? 'bg-(--color-success)' : 'bg-(--color-danger)'
                        }`}
                      />
                      <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="text-(--color-text)">
                          {t(`inventory.sheet.reasons.${movement.reason}`)}
                        </span>
                        <span
                          className={`tabular font-semibold ${delta >= 0 ? 'text-(--color-success)' : 'text-(--color-danger)'}`}
                        >
                          {delta >= 0 ? '+' : '−'}
                          {formatNumber(Math.abs(delta))}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-baseline justify-between gap-3 text-xs text-(--color-muted)">
                        <span title={formatDateTime(movement.occurred_at)}>
                          {formatRelative(movement.occurred_at)}
                        </span>
                        <span className="tabular">
                          {t('inventory.sheet.balance', {
                            balance: formatNumber(movement.balance_after),
                          })}
                        </span>
                      </div>
                      {movement.note ? (
                        <p dir="auto" className="mt-1 text-xs text-(--color-text-2)">
                          {movement.note}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </DetailSection>
        </>
      ) : null}
    </DetailSheet>
  );
}
