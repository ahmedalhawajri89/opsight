'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useOrder, useOrderDraft } from '@/features/orders/useOrders';
import { useCustomers, useProducts } from '@/features/catalog/useCatalog';
import { OrderActions } from '@/features/orders/OrderActions';
import { Button } from '@/components/ui/Button';
import { Field, NumberInput, Select, Textarea } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/States';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney, formatNumber } from '@/lib/format';

/**
 * Order creation.
 *
 * Deliberately NOT a client-side basket that posts one big payload at the end.
 * The draft is created on the server first, and each line is added to it — so
 * the order exists, is recoverable, and is validated line by line.
 *
 * Note what this form never sends: a price, a cost or a total. It sends a
 * product id and a quantity. Prices are read from the catalog and snapshotted
 * at confirm, which is what keeps revenue a fact rather than a client
 * suggestion.
 */
export default function NewOrderPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [draftId, setDraftId] = useState(null);

  const { create, addItem, removeItem } = useOrderDraft();
  const { order, refetch } = useOrder(draftId);
  const { customers } = useCustomers({ per_page: 100, sort: 'name' });
  const { products } = useProducts({ per_page: 100, sort: 'name', filter: { is_active: 'true' } });

  const [customerId, setCustomerId] = useState('');
  const [notes, setNotes] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [failure, setFailure] = useState(null);

  async function startDraft() {
    setFailure(null);

    try {
      const response = await create.mutateAsync({
        customer_id: customerId === '' ? null : Number(customerId),
        notes: notes || null,
      });

      setDraftId(response.data.id);
    } catch (error) {
      setFailure(error.message);
    }
  }

  async function handleAddItem() {
    setFailure(null);

    try {
      await addItem.mutateAsync({
        orderId: draftId,
        product_id: Number(productId),
        quantity: Number(quantity),
      });

      setProductId('');
      setQuantity('1');
      refetch();
    } catch (error) {
      setFailure(error.fieldErrors?.product_id ?? error.fieldErrors?.quantity ?? error.message);
    }
  }

  const itemColumns = [
    { key: 'product_sku', header: t('orderDetail.columns.sku'), mono: true, width: '10rem' },
    { key: 'product_name', header: t('orderDetail.columns.product') },
    {
      key: 'quantity',
      header: t('orderDetail.columns.quantity'),
      numeric: true,
      width: '6rem',
      cell: (row) => formatNumber(row.quantity),
    },
    {
      key: 'unit_price',
      header: t('orderDetail.columns.unitPrice'),
      numeric: true,
      width: '9rem',
      cell: (row) => formatMoney(row.unit_price, { decimals: 4 }),
    },
    {
      key: 'actions',
      header: '',
      width: '5rem',
      cell: (row) => (
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            setFailure(null);

            try {
              await removeItem.mutateAsync({ orderId: draftId, itemId: row.id });
              refetch();
            } catch (error) {
              setFailure(error.message);
            }
          }}
        >
          {t('newOrder.remove')}
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={t('orders.new')}
        description={
          order
            ? t('newOrder.draftDescription', { reference: order.reference })
            : t('newOrder.description')
        }
      />

      {failure && (
        <p
          role="alert"
          className="rounded-(--radius-control) border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)"
        >
          {failure}
        </p>
      )}

      {!draftId ? (
        <Card title={t('newOrder.details')}>
          <div className="grid max-w-2xl gap-4">
            <Field label={t('newOrder.customer')} hint={t('newOrder.customerHint')}>
              {(props) => (
                <Select
                  placeholder={t('newOrder.walkInOption')}
                  options={customers.map((customer) => ({
                    value: customer.id,
                    label: customer.display_name ?? customer.name,
                  }))}
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  {...props}
                />
              )}
            </Field>

            <Field label={t('newOrder.notes')}>
              {(props) => (
                <Textarea
                  placeholder={t('newOrder.notesPlaceholder')}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  {...props}
                />
              )}
            </Field>

            <div>
              <Button variant="primary" loading={create.isPending} onClick={startDraft}>
                {t('newOrder.start')}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <>
          <Card title={t('newOrder.addItemTitle')}>
            <div className="flex flex-wrap items-end gap-3">
              <Field label={t('orderDetail.columns.product')} className="min-w-64 flex-1">
                {(props) => (
                  <Select
                    placeholder={t('newOrder.chooseProduct')}
                    options={products.map((product) => ({
                      value: product.id,
                      label: `${product.sku} — ${product.display_name ?? product.name}`,
                    }))}
                    value={productId}
                    onChange={(event) => setProductId(event.target.value)}
                    {...props}
                  />
                )}
              </Field>

              <Field label={t('newOrder.quantity')} className="w-28">
                {(props) => (
                  <NumberInput
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    {...props}
                  />
                )}
              </Field>

              <Button
                variant="secondary"
                loading={addItem.isPending}
                disabled={!productId}
                onClick={handleAddItem}
              >
                {t('newOrder.addItem')}
              </Button>
            </div>

            <p className="mt-3 text-sm text-(--color-muted)">{t('newOrder.priceNote')}</p>
          </Card>

          <Card title={t('orderDetail.items')} padded={false}>
            <DataTable
              caption={t('newOrder.draftItems')}
              columns={itemColumns}
              rows={order?.items ?? []}
              density="compact"
              empty={
                <EmptyState
                  title={t('newOrder.noItems')}
                  description={t('newOrder.noItemsDescription')}
                />
              }
            />
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <OrderActions
              order={order ?? { id: draftId, available_actions: [] }}
              onDone={() => router.push(`/orders/${draftId}`)}
            />
            <Button variant="ghost" onClick={() => router.push(`/orders/${draftId}`)}>
              {t('newOrder.saveAndView')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
