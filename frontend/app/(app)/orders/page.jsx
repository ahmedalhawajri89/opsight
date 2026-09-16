'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useOrders } from '@/features/orders/useOrders';
import { useAuth } from '@/features/auth/AuthProvider';
import { Can } from '@/features/auth/Can';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateInput, Input, Select } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatDate, formatMoney } from '@/lib/format';

/*
 * Defined at module scope, not inline.
 *
 * An inline object is a new reference every render, which defeats the
 * memoisation in useUrlFilters (see its usage note).
 */
const FILTER_CONFIG = {
  defaults: { sort: '-created_at', page: 1, per_page: 25 },
  allowed: ['search', 'status', 'placed_from', 'placed_to', 'sort', 'page', 'per_page'],
  sortable: ['reference', 'placed_at', 'total_amount', 'status', 'created_at'],
};

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'refunded', label: 'Refunded' },
];

export default function OrdersPage() {
  const router = useRouter();
  const { can } = useAuth();
  const { filters, setFilters, setPage, setSort, clearFilters, activeKeys } =
    useUrlFilters(FILTER_CONFIG);

  const { orders, meta, isLoading, isError, error, refetch } = useOrders({
    page: filters.page,
    per_page: filters.per_page,
    sort: filters.sort,
    filter: {
      search: filters.search,
      status: filters.status,
      placed_from: filters.placed_from,
      placed_to: filters.placed_to,
    },
  });

  const columns = [
    {
      key: 'reference',
      header: 'Order',
      sortable: true,
      mono: true,
      width: '13rem',
      cell: (row) => (
        <Link
          href={`/orders/${row.id}`}
          className="text-[--color-accent-text] hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.reference}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      // A walk-in order has no customer record, and saying so is more useful
      // than an empty cell.
      cell: (row) =>
        row.customer?.name ?? <span className="text-[--color-text-subtle]">Walk-in</span>,
    },
    {
      key: 'status',
      header: 'Status',
      width: '9rem',
      cell: (row) => <OrderStatusBadge status={row.status} />,
    },
    {
      key: 'placed_at',
      header: 'Placed',
      sortable: true,
      numeric: true,
      width: '9rem',
      // A draft has no placed_at: it has not been committed, so it has no
      // business date. The em dash says that.
      cell: (row) => formatDate(row.placed_at),
    },
    {
      key: 'total_amount',
      header: 'Total',
      sortable: true,
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.total_amount),
    },
  ];

  // Cost-bearing columns are added only for roles that hold the ability. The
  // server omits the keys regardless — this is about not rendering an empty
  // column header for someone who will never see data under it.
  if (can('orders.view_margin')) {
    columns.push({
      key: 'gross_profit',
      header: 'Gross profit',
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.gross_profit),
    });
  }

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Every committed sale, and the drafts on their way to becoming one."
        actions={
          <Can ability="orders.create">
            <Button variant="primary" onClick={() => router.push('/orders/new')}>
              New order
            </Button>
          </Can>
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder="Search by reference…"
          aria-label="Search orders"
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-56"
        />
        <Select
          aria-label="Status"
          placeholder="Any status"
          options={STATUS_OPTIONS}
          value={filters.status ?? ''}
          onChange={(event) => setFilters({ status: event.target.value })}
          className="w-40"
        />
        <DateInput
          aria-label="Placed from"
          value={filters.placed_from ?? ''}
          onChange={(event) => setFilters({ placed_from: event.target.value })}
          className="w-40"
        />
        <DateInput
          aria-label="Placed to"
          value={filters.placed_to ?? ''}
          onChange={(event) => setFilters({ placed_to: event.target.value })}
          className="w-40"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption="Orders"
          columns={columns}
          rows={orders}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          sort={filters.sort}
          onSortChange={setSort}
          onRowClick={(row) => router.push(`/orders/${row.id}`)}
          activeFilters={activeKeys.map((key) => `${key}: ${filters[key]}`)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title="No orders yet"
              description="Orders you create will appear here with their status, dates and totals."
              action={
                <Can ability="orders.create">
                  <Button variant="primary" onClick={() => router.push('/orders/new')}>
                    Create the first order
                  </Button>
                </Can>
              }
            />
          }
        />
        <Pagination
          meta={meta}
          onPageChange={setPage}
          onPerPageChange={(perPage) => setFilters({ per_page: perPage })}
        />
      </Card>
    </div>
  );
}
