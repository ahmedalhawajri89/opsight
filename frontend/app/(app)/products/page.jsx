'use client';

import { useProducts } from '@/features/catalog/useCatalog';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatMoney, formatNumber } from '@/lib/format';

const FILTER_CONFIG = {
  defaults: { sort: 'name', page: 1, per_page: 25 },
  allowed: ['search', 'is_active', 'low_stock', 'sort', 'page', 'per_page'],
  sortable: ['name', 'sku', 'price', 'created_at'],
};

export default function ProductsPage() {
  const { can } = useAuth();
  const { filters, setFilters, setPage, setSort, clearFilters, activeKeys } =
    useUrlFilters(FILTER_CONFIG);

  const { products, meta, isLoading, isError, error, refetch } = useProducts({
    page: filters.page,
    per_page: filters.per_page,
    sort: filters.sort,
    filter: {
      search: filters.search,
      is_active: filters.is_active,
      low_stock: filters.low_stock,
    },
  });

  const columns = [
    { key: 'sku', header: 'SKU', sortable: true, mono: true, width: '10rem' },
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      cell: (row) => (
        <span className="flex items-center gap-2">
          {row.name}
          {!row.is_active && <Badge tone="neutral">Inactive</Badge>}
        </span>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      width: '11rem',
      cell: (row) => row.category?.name ?? '—',
    },
    {
      key: 'price',
      header: 'Price',
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
            header: 'Cost',
            numeric: true,
            width: '9rem',
            cell: (row) => formatMoney(row.cost, { decimals: 4 }),
          },
        ]
      : []),
    {
      key: 'stock',
      header: 'Stock',
      numeric: true,
      width: '8rem',
      cell: (row) =>
        row.stock ? (
          <span className={row.stock.is_low ? 'text-[--color-warning]' : undefined}>
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
        title="Products"
        description="The catalog. Editing a price or cost affects future orders only — past orders keep their own snapshots."
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder="Search name or SKU…"
          aria-label="Search products"
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-56"
        />
        <Select
          aria-label="Active state"
          placeholder="All products"
          options={[
            { value: 'true', label: 'Active only' },
            { value: 'false', label: 'Inactive only' },
          ]}
          value={filters.is_active ?? ''}
          onChange={(event) => setFilters({ is_active: event.target.value })}
          className="w-40"
        />
        <Select
          aria-label="Stock level"
          placeholder="Any stock level"
          options={[{ value: 'true', label: 'Low stock only' }]}
          value={filters.low_stock ?? ''}
          onChange={(event) => setFilters({ low_stock: event.target.value })}
          className="w-44"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption="Products"
          columns={columns}
          rows={products}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          sort={filters.sort}
          onSortChange={setSort}
          activeFilters={activeKeys.map((key) => `${key}: ${filters[key]}`)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title="No products yet"
              description="Products supply the price and cost used at the moment of sale."
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
