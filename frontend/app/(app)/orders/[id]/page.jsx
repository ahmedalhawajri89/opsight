'use client';

import Link from 'next/link';
import { use } from 'react';

import { useOrder } from '@/features/orders/useOrders';
import { OrderActions } from '@/features/orders/OrderActions';
import { useAuth } from '@/features/auth/AuthProvider';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { SkeletonTable, SkeletonText } from '@/components/ui/Skeleton';
import { DataTable } from '@/components/data/DataTable';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { formatDateTime, formatMoney } from '@/lib/format';

export default function OrderDetailPage({ params }) {
  const { id } = use(params);
  const { can } = useAuth();
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
    { key: 'product_sku', header: 'SKU', mono: true, width: '10rem' },
    {
      key: 'product_name',
      header: 'Product',
      // The SNAPSHOT name, as recorded at confirm. If the product has since
      // been renamed, this still shows what was actually sold.
      cell: (row) =>
        row.product_id ? (
          <Link
            href={`/products/${row.product_id}`}
            className="text-[--color-accent-text] hover:underline"
          >
            {row.product_name}
          </Link>
        ) : (
          row.product_name
        ),
    },
    { key: 'quantity', header: 'Qty', numeric: true, width: '6rem' },
    {
      key: 'unit_price',
      header: 'Unit price',
      numeric: true,
      width: '9rem',
      cell: (row) => formatMoney(row.unit_price, { decimals: 4 }),
    },
    ...(showCost
      ? [
          {
            key: 'unit_cost',
            header: 'Unit cost',
            numeric: true,
            width: '9rem',
            cell: (row) => formatMoney(row.unit_cost, { decimals: 4 }),
          },
        ]
      : []),
    {
      key: 'line_total',
      header: 'Line total',
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
            <>
              <Link
                href={`/customers/${order.customer.id}`}
                className="text-[--color-accent-text] hover:underline"
              >
                {order.customer.name}
              </Link>
            </>
          ) : (
            'Walk-in — no customer record'
          )
        }
        actions={<OrderStatusBadge status={order.status} />}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Timeline" className="lg:col-span-1">
          <dl className="space-y-2.5 text-sm">
            <Row label="Placed" value={formatDateTime(order.placed_at)} />
            <Row label="Fulfilled" value={formatDateTime(order.fulfilled_at)} />
            {order.cancelled_at && (
              <>
                <Row label="Cancelled" value={formatDateTime(order.cancelled_at)} />
                <Row label="Reason" value={order.cancellation_reason} />
              </>
            )}
            {order.refunded_at && (
              <>
                <Row label="Refunded" value={formatDateTime(order.refunded_at)} />
                <Row label="Refund amount" value={formatMoney(order.refunded_amount)} />
              </>
            )}
          </dl>

          {order.status === 'draft' && (
            <p className="mt-4 rounded-[--radius-sm] border border-[--color-line] bg-[--color-surface-sunken] p-3 text-[0.8125rem] text-[--color-text-muted]">
              This is a draft. It appears in no metric until it is confirmed, and prices are
              snapshotted at that moment — not now.
            </p>
          )}
        </Card>

        <Card title="Totals" className="lg:col-span-2">
          <dl className="space-y-2.5 text-sm">
            <Row label="Subtotal" value={formatMoney(order.subtotal_amount)} numeric />
            <Row label="Discount" value={formatMoney(order.discount_amount)} numeric />
            <Row label="Tax" value={formatMoney(order.tax_amount)} numeric />
            <Row label="Shipping" value={formatMoney(order.shipping_amount)} numeric />
            <div className="border-t border-[--color-line] pt-2.5">
              <Row label="Total" value={formatMoney(order.total_amount)} numeric strong />
            </div>

            {/* Absent, not null, for a cost-blind role. */}
            {order.cogs_amount !== undefined && (
              <div className="border-t border-[--color-line] pt-2.5">
                <Row label="Cost of goods" value={formatMoney(order.cogs_amount)} numeric />
                <Row label="Gross profit" value={formatMoney(order.gross_profit)} numeric strong />
              </div>
            )}
          </dl>

          <p className="mt-4 text-[0.8125rem] text-[--color-text-subtle]">
            Tax and shipping are excluded from revenue. Tax is collected for a tax authority, and
            shipping is treated as cost recovery.
          </p>
        </Card>
      </div>

      <Card title="Items" padded={false}>
        <DataTable
          caption={`Items on ${order.reference}`}
          columns={itemColumns}
          rows={order.items ?? []}
          density="compact"
        />
      </Card>

      <OrderActions order={order} onDone={refetch} />
    </div>
  );
}

function Row({ label, value, numeric = false, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[--color-text-muted]">{label}</dt>
      <dd
        className={[
          numeric ? 'tabular text-end' : '',
          strong ? 'font-semibold text-[--color-text]' : 'text-[--color-text]',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}
