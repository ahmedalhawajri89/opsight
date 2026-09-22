'use client';

import Link from 'next/link';
import { use } from 'react';

import { useOrder } from '@/features/orders/useOrders';
import { OrderActions } from '@/features/orders/OrderActions';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { SkeletonTable, SkeletonText } from '@/components/ui/Skeleton';
import { DataTable } from '@/components/data/DataTable';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { formatDateTime, formatMoney, formatNumber } from '@/lib/format';

export default function OrderDetailPage({ params }) {
  const { id } = use(params);
  const { can } = useAuth();
  const { t } = useI18n();
  const { order, isLoading, isError, error, refetch } = useOrder(id);

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-4">
        <SkeletonText lines={2} className="max-w-md" />
        <Card>
          <SkeletonTable columns={4} rows={4} />
        </Card>
      </div>
    );
  }

  if (isError) {
    return error?.isForbidden ? (
      <ForbiddenState />
    ) : (
      <Card padded={false}>
        <ErrorState error={error} onRetry={refetch} />
      </Card>
    );
  }

  if (!order) return null;

  const showCost = can('products.view_cost');

  const itemColumns = [
    { key: 'product_sku', header: t('orderDetail.columns.sku'), mono: true, width: '10rem' },
    {
      key: 'product_name',
      header: t('orderDetail.columns.product'),
      // The SNAPSHOT name, as recorded at confirm. If the product has since
      // been renamed, this still shows what was actually sold.
      cell: (row) =>
        row.product_id ? (
          <Link
            href={`/products/${row.product_id}`}
            className="text-(--color-brand-text) hover:underline"
          >
            {row.display_name ?? row.product_name}
          </Link>
        ) : (
          (row.display_name ?? row.product_name)
        ),
    },
    {
      key: 'quantity',
      header: t('orderDetail.columns.quantity'),
      numeric: true,
      width: '6rem',
      // Formatted, not raw: a bare number would ignore the reader's digits.
      cell: (row) => formatNumber(row.quantity),
    },
    {
      key: 'unit_price',
      header: t('orderDetail.columns.unitPrice'),
      numeric: true,
      width: '9rem',
      cell: (row) => formatMoney(row.unit_price, { decimals: 4 }),
    },
    ...(showCost
      ? [
          {
            key: 'unit_cost',
            header: t('orderDetail.columns.unitCost'),
            numeric: true,
            width: '9rem',
            cell: (row) => formatMoney(row.unit_cost, { decimals: 4 }),
          },
        ]
      : []),
    {
      key: 'line_total',
      header: t('orderDetail.columns.lineTotal'),
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.line_total),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={order.reference}
        description={
          order.customer ? (
            <Link
              href={`/customers/${order.customer.id}`}
              className="text-(--color-brand-text) hover:underline"
            >
              {order.customer.display_name ?? order.customer.name}
            </Link>
          ) : (
            t('orderDetail.walkIn')
          )
        }
        actions={<OrderStatusBadge status={order.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('orderDetail.timeline')} className="lg:col-span-1">
          <dl className="space-y-2.5 text-base">
            <Row label={t('orderDetail.placed')} value={formatDateTime(order.placed_at)} />
            <Row label={t('orderDetail.fulfilled')} value={formatDateTime(order.fulfilled_at)} />
            {order.cancelled_at && (
              <>
                <Row
                  label={t('orderDetail.cancelled')}
                  value={formatDateTime(order.cancelled_at)}
                />
                <Row label={t('orderDetail.reason')} value={order.cancellation_reason} />
              </>
            )}
            {order.refunded_at && (
              <>
                <Row label={t('orderDetail.refunded')} value={formatDateTime(order.refunded_at)} />
                {/* What the customer got back: the revenue part plus any VAT returned. */}
                <Row
                  label={t('orderDetail.refundAmount')}
                  value={formatMoney(order.refunded_total ?? order.refunded_amount)}
                />
                {order.vat_applied && (
                  <Row
                    label={t('orderDetail.refundVat')}
                    value={formatMoney(order.refunded_vat_amount)}
                  />
                )}
              </>
            )}
          </dl>

          {order.status === 'draft' && (
            <p className="mt-4 rounded-(--radius-control) border border-(--color-line) bg-(--color-ground) p-3 text-sm text-(--color-text-2)">
              {t('orderDetail.draftNote')}
            </p>
          )}
        </Card>

        <Card title={t('orderDetail.totals')} className="lg:col-span-2">
          <dl className="space-y-2.5 text-base">
            <Row
              label={t('orderDetail.subtotal')}
              value={formatMoney(order.subtotal_amount)}
              numeric
            />
            <Row
              label={t('orderDetail.discount')}
              value={formatMoney(order.discount_amount)}
              numeric
            />
            <Row
              label={order.vat_applied ? t('orderDetail.vat') : t('orderDetail.tax')}
              value={formatMoney(order.tax_amount)}
              numeric
            />
            <Row
              label={t('orderDetail.shipping')}
              value={formatMoney(order.shipping_amount)}
              numeric
            />
            <div className="border-t border-(--color-line) pt-2.5">
              <Row
                label={t('orderDetail.total')}
                value={formatMoney(order.total_amount)}
                numeric
                strong
              />
            </div>

            {/* Absent, not null, for a cost-blind role. */}
            {order.cogs_amount !== undefined && (
              <div className="border-t border-(--color-line) pt-2.5">
                <Row
                  label={t('metrics.cogs.label')}
                  value={formatMoney(order.cogs_amount)}
                  numeric
                />
                <Row
                  label={t('metrics.gross_profit.label')}
                  value={formatMoney(order.gross_profit)}
                  numeric
                  strong
                />
              </div>
            )}
          </dl>

          <p className="mt-4 text-sm text-(--color-muted)">
            {order.vat_applied
              ? t(order.prices_include_vat ? 'orderDetail.vatNoteInclusive' : 'orderDetail.vatNote')
              : t('orderDetail.taxNote')}
          </p>
        </Card>
      </div>

      {/* A draft or cancelled order owes nothing, so has no payment section. */}
      {order.payment_status && <PaymentsCard order={order} />}

      {(order.refunds ?? []).length > 0 && <RefundsCard order={order} />}

      <Card title={t('orderDetail.items')} padded={false}>
        <DataTable
          caption={t('orderDetail.itemsCaption', { reference: order.reference })}
          columns={itemColumns}
          rows={order.items ?? []}
          density="compact"
        />
      </Card>

      <OrderActions order={order} onDone={refetch} />
    </div>
  );
}

/**
 * Money received against the order, and where that leaves it (ADR-022). The
 * status and the outstanding figure come from the server, derived from the
 * ledgers; nothing here re-computes them.
 */
function PaymentsCard({ order }) {
  const { t } = useI18n();
  const payments = order.payments ?? [];

  const columns = [
    {
      key: 'paid_at',
      header: t('orderDetail.columns.date'),
      width: '12rem',
      cell: (row) => formatDateTime(row.paid_at),
    },
    {
      key: 'method',
      header: t('orderDetail.columns.method'),
      cell: (row) =>
        row.is_backfill ? (
          <span className="text-(--color-muted)">{t('orderDetail.backfilledPayment')}</span>
        ) : (
          t(`paymentMethod.${row.method}`)
        ),
    },
    {
      key: 'reference',
      header: t('orderDetail.columns.reference'),
      mono: true,
      cell: (row) => row.reference ?? '—',
    },
    {
      key: 'amount',
      header: t('orderDetail.columns.amount'),
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.amount),
    },
  ];

  return (
    <Card
      title={t('orderDetail.payment')}
      actions={<PaymentStatusBadge status={order.payment_status} />}
      padded={false}
    >
      <dl className="grid gap-x-8 gap-y-2.5 px-5 pb-4 text-base sm:grid-cols-2">
        <Row label={t('orderDetail.paid')} value={formatMoney(order.amount_paid)} numeric />
        <Row
          label={t('orderDetail.outstanding')}
          value={formatMoney(order.outstanding_amount)}
          numeric
          strong
        />
      </dl>

      {payments.length > 0 ? (
        <DataTable
          caption={t('orderDetail.paymentsCaption', { reference: order.reference })}
          columns={columns}
          rows={payments}
          density="compact"
        />
      ) : (
        <p className="px-5 pb-4 text-sm text-(--color-muted)">{t('orderDetail.noPayments')}</p>
      )}
    </Card>
  );
}

/** Every refund, in order: an order may be refunded more than once (ADR-022). */
function RefundsCard({ order }) {
  const { t } = useI18n();

  const columns = [
    {
      key: 'refunded_at',
      header: t('orderDetail.columns.date'),
      width: '12rem',
      cell: (row) => formatDateTime(row.refunded_at),
    },
    {
      key: 'reason',
      header: t('orderDetail.columns.reason'),
      cell: (row) => row.reason ?? <span className="text-(--color-muted)">—</span>,
    },
    {
      key: 'returned_stock',
      header: t('orderDetail.columns.restocked'),
      width: '8rem',
      cell: (row) => (row.returned_stock ? t('common.yes') : t('common.no')),
    },
    ...(order.vat_applied
      ? [
          {
            key: 'vat_amount',
            header: t('orderDetail.columns.vatReturned'),
            numeric: true,
            width: '9rem',
            cell: (row) => formatMoney(row.vat_amount),
          },
        ]
      : []),
    {
      key: 'total',
      header: t('orderDetail.columns.amount'),
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.total),
    },
  ];

  return (
    <Card title={t('orderDetail.refunds')} padded={false}>
      <DataTable
        caption={t('orderDetail.refundsCaption', { reference: order.reference })}
        columns={columns}
        rows={order.refunds}
        density="compact"
      />
    </Card>
  );
}

function Row({ label, value, numeric = false, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-(--color-text-2)">{label}</dt>
      <dd
        className={[
          numeric ? 'tabular text-end' : '',
          strong ? 'font-semibold text-(--color-text)' : 'text-(--color-text)',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
