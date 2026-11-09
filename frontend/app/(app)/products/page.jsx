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
import { ResultSummary } from '@/components/data/ResultSummary';
import { EmptyState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';
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

  const { products, meta, totals, isLoading, isError, error, refetch } = useProducts(query);
  // null means "no dialog"; a product means edit; 'new' means create.
  const [editing, setEditing] = useState(null);

  const columns = [
    {
      key: 'sku',
      header: t('orderDetail.columns.sku'),
      sortable: true,
      mono: true,
      width: '10rem',
      // Reachable from a keyboard, not only by clicking the row.
      cell: (row) =>
        can('products.update') ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(row);
            }}
            className="font-mono text-(--color-brand-text) hover:underline"
          >
            {row.sku}
          </button>
        ) : (
          row.sku
        ),
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
      /*
       * `display_name`, not `name`. The resource sends both — the stored
       * English name and the one picked for the reader's language — and this
       * read the English one, so an Arabic interface printed "Office
       * Supplies" and "Consumables" down a column of Arabic product names.
       */
      cell: (row) => row.category?.display_name ?? row.category?.name ?? '—',
    },
    {
      key: 'price',
      header: t('products.columns.price'),
      sortable: true,
      numeric: true,
      primary: true,
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
          {
            key: 'margin',
            header: t('products.columns.margin'),
            numeric: true,
            width: '8rem',
            /*
             * Computed here rather than asked of the server, because both of
             * its inputs are already on the row and a derived figure that
             * travels is a figure that can disagree with what it was derived
             * from.
             *
             * Over PRICE, not over cost: this is the share of each dinar
             * taken that the business keeps, which is the number that
             * compares across a catalogue. Margin over cost is a markup, and
             * the two are different figures that look alike.
             *
             * Nothing at all when the price is zero or missing — a margin on
             * no revenue is a division by zero, and printing 0% would say
             * the product earns nothing rather than that it has no price.
             */
            cell: (row) => {
              const price = Number(row.price);
              const cost = Number(row.cost);

              if (!Number.isFinite(price) || !Number.isFinite(cost) || price <= 0) {
                return <span className="text-(--color-muted)">—</span>;
              }

              const margin = (price - cost) / price;

              return (
                <span
                  className={
                    margin <= 0 ? 'font-medium text-(--color-danger)' : 'text-(--color-text)'
                  }
                >
                  {formatPercent(margin)}
                </span>
              );
            },
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

  /*
   * Counted by the server over the whole filtered catalogue — never summed
   * from the rows on this page (ResultSummary). `stock_value` is absent for
   * a role that cannot see cost, so the item is simply not pushed.
   */
  const summary = [
    {
      key: 'matched',
      value: formatNumber(totals?.products ?? meta?.total ?? 0),
      label: t('products.summary.matched'),
    },
  ];

  if (totals?.stock_value !== undefined) {
    summary.push({
      key: 'stock_value',
      value: formatMoney(totals.stock_value),
      label: t('products.summary.stockValue'),
      tone: 'accent',
    });
  }

  return (
    <div>
      <PageHeader
        title={t('nav.items.products')}
        description={t('products.description')}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {can('products.export') && <ExportButton onExport={exportProducts} filters={query} />}
            <Can ability="products.create">
              <Button variant="primary" onClick={() => setEditing('new')}>
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
        <ResultSummary items={summary} loading={isLoading} />

        {/*
            `bare`: the Card around it already draws the edge. A bordered
            table inside a bordered card is a box in a box (DataTable).
          */}
        <DataTable
          bare
          caption={t('nav.items.products')}
          columns={columns}
          rows={products}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          onRowClick={can('products.update') ? (row) => setEditing(row) : undefined}
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
                  <Button variant="primary" onClick={() => setEditing('new')}>
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
        key={editing === null ? 'closed' : (editing.id ?? 'new')}
        open={editing !== null}
        product={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onCreated={() => refetch()}
      />
    </div>
  );
}
