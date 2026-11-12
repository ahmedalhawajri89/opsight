'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { useOrder, useOrderDraft } from '@/features/orders/useOrders';
import { useCustomers, useProducts } from '@/features/catalog/useCatalog';
import { CatalogPicker } from '@/features/orders/CatalogPicker';
import { OrderActions } from '@/features/orders/OrderActions';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Field, NumberInput, Textarea } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/States';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/cn';
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

  /*
   * A page of the catalogue is not the catalogue. `per_page: 100` is the
   * server's maximum, so the only way to reach the hundred-and-first product
   * is to search for it — on the server, through the same filter the list
   * screens use.
   */
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const customerTerm = useDebouncedValue(customerSearch.trim());
  const productTerm = useDebouncedValue(productSearch.trim());

  const {
    customers,
    meta: customerMeta,
    isLoading: loadingCustomers,
    isError: customersFailed,
    error: customerError,
    refetch: refetchCustomers,
  } = useCustomers({ per_page: 100, sort: 'name', filter: { search: customerTerm } });

  const {
    products,
    meta: productMeta,
    isLoading: loadingProducts,
    isError: productsFailed,
    error: productError,
    refetch: refetchProducts,
  } = useProducts({
    per_page: 100,
    sort: 'name',
    filter: { is_active: 'true', search: productTerm },
  });

  const [customerId, setCustomerId] = useState('');
  const [chosenCustomer, setChosenCustomer] = useState(null);
  const [notes, setNotes] = useState('');
  const [productId, setProductId] = useState('');
  const [chosenProduct, setChosenProduct] = useState(null);
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
      setChosenProduct(null);
      setQuantity('1');
      refetch();
    } catch (error) {
      setFailure(error.fieldErrors?.product_id ?? error.fieldErrors?.quantity ?? error.message);
    }
  }

  /*
   * The option objects, built once: the pickers keep whichever one is chosen
   * on the list even after a later search would have filtered it out.
   */
  const customerOptions = customers.map((customer) => ({
    value: customer.id,
    label: customer.display_name ?? customer.name,
  }));

  const productOptions = products.map((product) => ({
    value: product.id,
    label: `${product.sku} — ${product.display_name ?? product.name}`,
  }));

  function choose(options, setId, setChosen) {
    return (event) => {
      setId(event.target.value);
      setChosen(options.find((option) => String(option.value) === event.target.value) ?? null);
    };
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

  const step = !draftId ? 1 : (order?.items ?? []).length === 0 ? 2 : 3;
  const lines = order?.items ?? [];
  const units = lines.reduce((sum, line) => sum + (Number(line.quantity) || 0), 0);
  const customerName = order?.customer
    ? (order.customer.display_name ?? order.customer.name)
    : (chosenCustomer?.label ?? null);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('orders.new')}
        description={
          order
            ? t('newOrder.draftDescription', { reference: order.reference })
            : t('newOrder.description')
        }
      />

      <Steps current={step} />

      {failure && (
        <p
          role="alert"
          className="rounded-(--radius-control) border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)"
        >
          {failure}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0 space-y-5">
          {!draftId ? (
            <Card title={t('newOrder.details')} icon="customers">
              {/* Side by side on a wide screen: who it is for, and anything worth noting. */}
              <div className="grid gap-5 lg:grid-cols-2">
                <CatalogPicker
                  label={t('newOrder.customer')}
                  hint={t('newOrder.customerHint')}
                  searchLabel={t('customers.searchLabel')}
                  searchPlaceholder={t('customers.searchPlaceholder')}
                  search={customerSearch}
                  onSearchChange={setCustomerSearch}
                  placeholder={t('newOrder.walkInOption')}
                  options={customerOptions}
                  value={customerId}
                  selected={chosenCustomer}
                  onChange={choose(customerOptions, setCustomerId, setChosenCustomer)}
                  isLoading={loadingCustomers}
                  isError={customersFailed}
                  error={customerError}
                  onRetry={refetchCustomers}
                  total={customerMeta?.total}
                />

                <Field label={t('newOrder.notes')}>
                  {(props) => (
                    <Textarea
                      rows={5}
                      placeholder={t('newOrder.notesPlaceholder')}
                      value={notes}
                      onChange={(event) => setNotes(event.target.value)}
                      {...props}
                    />
                  )}
                </Field>
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-(--border-subtle) pt-4">
                <p className="text-xs text-(--color-muted)">{t('newOrder.startHint')}</p>
                <Button variant="primary" loading={create.isPending} onClick={startDraft}>
                  {t('newOrder.start')}
                  <Icon name="arrowRight" size={16} className="rtl:rotate-180" aria-hidden="true" />
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <Card title={t('newOrder.addItemTitle')} icon="products">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end">
                  <CatalogPicker
                    label={t('orderDetail.columns.product')}
                    searchLabel={t('products.searchLabel')}
                    searchPlaceholder={t('products.searchPlaceholder')}
                    search={productSearch}
                    onSearchChange={setProductSearch}
                    placeholder={t('newOrder.chooseProduct')}
                    options={productOptions}
                    value={productId}
                    selected={chosenProduct}
                    onChange={choose(productOptions, setProductId, setChosenProduct)}
                    isLoading={loadingProducts}
                    isError={productsFailed}
                    error={productError}
                    onRetry={refetchProducts}
                    total={productMeta?.total}
                  />

                  <Field label={t('newOrder.quantity')}>
                    {(props) => (
                      <NumberInput
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                        {...props}
                      />
                    )}
                  </Field>

                  <Button
                    variant="primary"
                    loading={addItem.isPending}
                    disabled={!productId}
                    onClick={handleAddItem}
                  >
                    <Icon name="plus" size={16} aria-hidden="true" />
                    {t('newOrder.addItem')}
                  </Button>
                </div>

                <p className="mt-3 text-xs text-(--color-muted)">{t('newOrder.priceNote')}</p>
              </Card>

              <Card title={t('orderDetail.items')} padded={false}>
                <DataTable
                  bare
                  caption={t('newOrder.draftItems')}
                  columns={itemColumns}
                  rows={lines}
                  density="compact"
                  empty={
                    <EmptyState
                      title={t('newOrder.noItems')}
                      description={t('newOrder.noItemsDescription')}
                    />
                  }
                />
              </Card>
            </>
          )}
        </div>

        {/*
          What the order is so far, beside the form: who it is for, how many
          lines and units. Counts only: a draft has no totals until it is
          confirmed, when prices are read from the catalogue, and the screen
          says so rather than adding them up itself.
        */}
        <aside
          aria-label={t('newOrder.summary.title')}
          className="min-w-0 space-y-4 xl:sticky xl:top-20"
        >
          <Card title={t('newOrder.summary.title')} icon="receipt">
            <dl className="space-y-3 text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-(--color-text-2)">{t('newOrder.summary.reference')}</dt>
                <dd className="font-mono text-(--color-text)">{order?.reference ?? '—'}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-(--color-text-2)">{t('newOrder.customer')}</dt>
                <dd className="truncate font-medium text-(--color-text)">
                  <bdi>{customerName ?? t('common.walkIn')}</bdi>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-(--color-text-2)">{t('newOrder.summary.lines')}</dt>
                <dd className="tabular font-semibold text-(--color-text)">
                  {formatNumber(lines.length)}
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-(--color-text-2)">{t('newOrder.summary.units')}</dt>
                <dd className="tabular font-semibold text-(--color-text)">{formatNumber(units)}</dd>
              </div>
            </dl>

            <p className="mt-4 rounded-xl bg-(--color-ground) p-3 text-xs leading-5 text-(--color-text-2)">
              {t('newOrder.summary.totalAtConfirm')}
            </p>

            {draftId ? (
              <div className="mt-4 flex flex-col gap-2 border-t border-(--border-subtle) pt-4">
                <OrderActions
                  order={order ?? { id: draftId, available_actions: [] }}
                  onDone={() => router.push(`/orders/${draftId}`)}
                />
                <Button variant="ghost" onClick={() => router.push(`/orders/${draftId}`)}>
                  {t('newOrder.saveAndView')}
                </Button>
              </div>
            ) : null}
          </Card>

          <Card title={t('newOrder.how.title')} icon="info">
            <ol className="space-y-3 text-xs leading-5 text-(--color-text-2)">
              {['draft', 'prices', 'stock'].map((key, index) => (
                <li key={key} className="flex gap-2.5">
                  <span
                    aria-hidden="true"
                    className="tabular flex size-5 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-[11px] font-semibold text-(--color-brand-text)"
                  >
                    {formatNumber(index + 1)}
                  </span>
                  {t(`newOrder.how.${key}`)}
                </li>
              ))}
            </ol>
          </Card>
        </aside>
      </div>
    </div>
  );
}

/**
 * Where the order stands: details, then lines, then confirm. The steps are
 * the server's states read back (no draft, a draft with no lines, a draft
 * with lines), not a wizard the screen keeps on its own.
 */
function Steps({ current }) {
  const { t } = useI18n();

  return (
    <ol
      className="flex flex-wrap items-center gap-2 sm:gap-3"
      aria-label={t('newOrder.steps.label')}
    >
      {['details', 'items', 'confirm'].map((key, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;

        return (
          <li
            key={key}
            aria-current={active ? 'step' : undefined}
            className="flex items-center gap-2 sm:gap-3"
          >
            <span
              className={cn(
                'flex items-center gap-2 rounded-(--radius-pill) border px-3 py-1.5 text-sm font-medium transition-colors duration-(--duration-base)',
                active && 'border-(--color-brand) bg-(--color-brand) text-(--color-text-inverse)',
                done && 'border-(--color-success) bg-(--color-success-soft) text-(--color-success)',
                !active &&
                  !done &&
                  'border-(--color-line) bg-(--color-surface) text-(--color-text-2)',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'tabular flex size-5 items-center justify-center rounded-full text-[11px] font-semibold',
                  active && 'bg-white/20',
                  done && 'bg-(--color-success) text-white',
                  !active && !done && 'bg-(--color-surface-selected)',
                )}
              >
                {done ? <Icon name="check" size={12} /> : formatNumber(number)}
              </span>
              {t(`newOrder.steps.${key}`)}
            </span>
            {number < 3 ? (
              <span
                aria-hidden="true"
                className="hidden h-px w-8 bg-(--color-line-strong) sm:block"
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
