'use client';

import { useState } from 'react';

import { useProducts } from '@/features/catalog/useCatalog';
import { ProductFormDialog } from '@/features/catalog/ProductFormDialog';
import { Can } from '@/features/auth/Can';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { describeFilters } from '@/lib/i18n/filters';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { ExportButton } from '@/components/data/ExportButton';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatMoney, formatNumber } from '@/lib/format';
import { exportProducts } from '@/services/catalog';

const FILTER_CONFIG = {
  defaults: { sort: 'name', page: 1, per_page: 25 },
  allowed: ['search', 'is_active', 'low_stock', 'sort', 'page', 'per_page'],
  sortable: ['name', 'sku', 'price', 'created_at'],
};

export default function ProductsPage() {
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
      is_active: filters.is_active,
      low_stock: filters.low_stock,
    },
  };

  const { products, meta, isLoading, isError, error, refetch } = useProducts(query);
  const [creating, setCreating] = useState(false);

  const columns = [
    {
      key: 'sku',
      header: t('orderDetail.columns.sku'),
      sortable: true,
      mono: true,
      width: '10rem',
    },
    {
      key: 'name',
      header: t('orderDetail.columns.product'),
      sortable: true,
      cell: (row) => (
        <span className="flex items-center gap-2">
          {row.display_name ?? row.name}
          {!row.is_active && <Badge tone="neutral">{t('common.inactive')}</Badge>}
        </span>
      ),
    },
    {
      key: 'category',
      header: t('products.columns.category'),
      width: '11rem',
      cell: (row) => row.category?.name ?? '—',
    },
    {
      key: 'price',
      header: t('products.columns.price'),
      sortable: true,
      numeric: true,
      width: '9rem',
      cell: (row) => formatMoney(row.price, { decimals: 4 }),
    },
    // `cost` is absent from the payload for a cost-blind role, so the column is
    // not rendered either. The server decides; this just avoids an empty header.
    ...(can('products.view_cost')
      ? [
          {
            key: 'cost',
            header: t('products.columns.cost'),
            numeric: true,
            width: '9rem',
            cell: (row) => formatMoney(row.cost, { decimals: 4 }),
          },
        ]
      : []),
    {
      key: 'stock',
      header: t('products.columns.stock'),
      numeric: true,
      width: '8rem',
      cell: (row) =>
        row.stock ? (
          <span className={row.stock.is_low ? 'text-(--color-warning)' : undefined}>
            {formatNumber(row.stock.on_hand)}
          </span>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.items.products')}
        description={t('products.description')}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {can('products.export') && <ExportButton onExport={exportProducts} filters={query} />}
            <Can ability="products.create">
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('products.new.action')}
              </Button>
            </Can>
          </div>
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder={t('products.searchPlaceholder')}
          aria-label={t('products.searchLabel')}
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-56"
        />
        <Select
          aria-label={t('catalog.activeState')}
          placeholder={t('products.all')}
          options={[
            { value: 'true', label: t('catalog.activeOnly') },
            { value: 'false', label: t('catalog.inactiveOnly') },
          ]}
          value={filters.is_active ?? ''}
          onChange={(event) => setFilters({ is_active: event.target.value })}
          className="w-40"
        />
        <Select
          aria-label={t('catalog.stockLevel')}
          placeholder={t('catalog.anyStockLevel')}
          options={[{ value: 'true', label: t('catalog.lowStockOnly') }]}
          value={filters.low_stock ?? ''}
          onChange={(event) => setFilters({ low_stock: event.target.value })}
          className="w-44"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption={t('nav.items.products')}
          columns={columns}
          rows={products}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          sort={filters.sort}
          onSortChange={setSort}
          activeFilters={describeFilters(activeKeys, filters, t)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title={t('products.empty.title')}
              description={t('products.empty.description')}
              action={
                <Can ability="products.create">
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    {t('products.new.action')}
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

      <ProductFormDialog
        key={creating ? 'open' : 'closed'}
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={() => refetch()}
      />
    </div>
  );
}
