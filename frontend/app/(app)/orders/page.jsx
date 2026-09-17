'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useOrders } from '@/features/orders/useOrders';
import { useAuth } from '@/features/auth/AuthProvider';
import { Can } from '@/features/auth/Can';
import { useI18n } from '@/features/i18n/I18nProvider';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateInput, Input, Select } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { ExportButton } from '@/components/data/ExportButton';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatDate, formatMoney } from '@/lib/format';
import { describeFilters } from '@/lib/i18n/filters';
import { exportOrders } from '@/services/orders';

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

const STATUSES = ['draft', 'confirmed', 'fulfilled', 'cancelled', 'refunded'];

export default function OrdersPage() {
  const router = useRouter();
  const { can } = useAuth();
  const { t } = useI18n();
  const { filters, setFilters, setPage, setSort, clearFilters, activeKeys } =
    useUrlFilters(FILTER_CONFIG);

  /*
   * One object for the list and the export, so "export" means "export what I
   * am looking at". The server runs both through a single query definition,
   * so the file and the screen cannot drift apart.
   */
  const query = {
    page: filters.page,
    per_page: filters.per_page,
    sort: filters.sort,
    filter: {
      search: filters.search,
      status: filters.status,
      placed_from: filters.placed_from,
      placed_to: filters.placed_to,
    },
  };

  const { orders, meta, isLoading, isError, error, refetch } = useOrders(query);

  const columns = [
    {
      key: 'reference',
      header: t('orders.columns.order'),
      sortable: true,
      mono: true,
      width: '13rem',
      cell: (row) => (
        <Link
          href={`/orders/${row.id}`}
          className="text-(--color-accent-text) hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          {row.reference}
        </Link>
      ),
    },
    {
      key: 'customer',
      header: t('orders.columns.customer'),
      // A walk-in order has no customer record, and saying so is more useful
      // than an empty cell.
      cell: (row) =>
        row.customer?.name ?? (
          <span className="text-(--color-text-subtle)">{t('common.walkIn')}</span>
        ),
    },
    {
      key: 'status',
      header: t('orders.columns.status'),
      width: '9rem',
      cell: (row) => <OrderStatusBadge status={row.status} />,
    },
    {
      key: 'placed_at',
      header: t('orders.columns.placed'),
      sortable: true,
      numeric: true,
      width: '9rem',
      // A draft has no placed_at: it has not been committed, so it has no
      // business date. The em dash says that.
      cell: (row) => formatDate(row.placed_at),
    },
    {
      key: 'total_amount',
      header: t('orders.columns.total'),
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
      header: t('metrics.gross_profit.label'),
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.gross_profit),
    });
  }

  return (
    <div>
      <PageHeader
        title={t('nav.items.orders')}
        description={t('orders.description')}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {can('orders.export') && <ExportButton onExport={exportOrders} filters={query} />}
            <Can ability="orders.create">
              <Button variant="primary" onClick={() => router.push('/orders/new')}>
                {t('orders.new')}
              </Button>
            </Can>
          </div>
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder={t('orders.searchPlaceholder')}
          aria-label={t('orders.searchLabel')}
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-56"
        />
        <Select
          aria-label={t('filters.status')}
          placeholder={t('orders.anyStatus')}
          options={STATUSES.map((value) => ({ value, label: t(`orderStatus.${value}`) }))}
          value={filters.status ?? ''}
          onChange={(event) => setFilters({ status: event.target.value })}
          className="w-40"
        />
        <DateInput
          aria-label={t('filters.placed_from')}
          value={filters.placed_from ?? ''}
          onChange={(event) => setFilters({ placed_from: event.target.value })}
          className="w-40"
        />
        <DateInput
          aria-label={t('filters.placed_to')}
          value={filters.placed_to ?? ''}
          onChange={(event) => setFilters({ placed_to: event.target.value })}
          className="w-40"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption={t('nav.items.orders')}
          columns={columns}
          rows={orders}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          sort={filters.sort}
          onSortChange={setSort}
          onRowClick={(row) => router.push(`/orders/${row.id}`)}
          activeFilters={describeFilters(activeKeys, filters, t)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title={t('orders.empty.title')}
              description={t('orders.empty.description')}
              action={
                <Can ability="orders.create">
                  <Button variant="primary" onClick={() => router.push('/orders/new')}>
                    {t('orders.empty.action')}
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
