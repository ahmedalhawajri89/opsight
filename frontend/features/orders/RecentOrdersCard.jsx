'use client';

import Link from 'next/link';

import { useOrders } from '@/features/orders/useOrders';
import { Card } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState } from '@/components/data/States';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { formatDate, formatMoney } from '@/lib/format';

/*
 * The five most recently placed orders.
 *
 * Read through the ordinary orders list endpoint, with its own policy and its
 * own resource redaction — this panel adds no API surface and cannot show a
 * figure the Orders screen would not. It is deliberately NOT tied to the
 * selected period: "what just happened" is an operational question, and a
 * period ending last March would otherwise leave it showing last March.
 */
const QUERY = { page: 1, per_page: 5, sort: '-placed_at' };

export function RecentOrdersCard({ currency, decimals, className }) {
  const { orders, isLoading, isError, error, refetch } = useOrders(QUERY);

  const columns = [
    {
      key: 'reference',
      header: 'Order',
      cell: (row) => (
        <Link
          href={`/orders/${row.id}`}
          className="font-mono text-[0.8125rem] font-medium whitespace-nowrap text-(--color-accent-text) hover:underline"
        >
          {row.reference}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      cell: (row) => (
        <span className="block max-w-56 truncate">
          {row.customer?.name ?? <span className="text-(--color-text-muted)">Walk-in</span>}
        </span>
      ),
    },
    { key: 'status', header: 'Status', cell: (row) => <OrderStatusBadge status={row.status} /> },
    {
      key: 'placed_at',
      header: 'Placed',
      numeric: true,
      cell: (row) => (
        <span className="text-(--color-text-muted)">
          {row.placed_at ? formatDate(row.placed_at) : '—'}
        </span>
      ),
    },
    {
      key: 'total_amount',
      header: 'Total',
      numeric: true,
      cell: (row) => (
        <span className="font-medium">{formatMoney(row.total_amount, { currency, decimals })}</span>
      ),
    },
  ];

  return (
    <Card
      title="Recent orders"
      description="Latest activity, regardless of the selected period"
      padded={false}
      className={className}
      actions={
        <Link
          href="/orders"
          className="group inline-flex items-center gap-1 text-[0.8125rem] font-medium text-(--color-accent-text) hover:underline"
        >
          All orders
          <Icon
            name="arrowRight"
            size={14}
            className="transition-transform duration-150 group-hover:translate-x-0.5 rtl:-scale-x-100"
          />
        </Link>
      }
    >
      <DataTable
        caption="Recent orders"
        columns={columns}
        rows={orders}
        loading={isLoading}
        error={isError ? error : null}
        onRetry={refetch}
        bare
        empty={<EmptyState title="No orders yet" />}
      />
    </Card>
  );
}
