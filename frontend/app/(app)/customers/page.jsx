'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { useCustomers } from '@/features/catalog/useCatalog';
import { CustomerFormDialog } from '@/features/catalog/CustomerFormDialog';
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
import { formatDate, formatMoney, formatNumber } from '@/lib/format';
import { exportCustomers } from '@/services/catalog';

const FILTER_CONFIG = {
  defaults: { sort: 'name', page: 1, per_page: 25 },
  allowed: ['search', 'is_active', 'sort', 'page', 'per_page'],
  sortable: ['name', 'email', 'created_at'],
};

export default function CustomersPage() {
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
    filter: { search: filters.search, is_active: filters.is_active },
  };

  const { customers, meta, totals, isLoading, isError, error, refetch } = useCustomers(query);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  const columns = [
    {
      key: 'name',
      header: t('customers.columns.customer'),
      sortable: true,
      cell: (row) => (
        <span className="flex items-center gap-2">
          {/*
            A link, not just a clickable row: the row click below is for the
            mouse, and this is how the screen is reached from a keyboard.
          */}
          <Link
            href={`/customers/${row.id}`}
            className="text-(--color-brand-text) hover:underline"
            onClick={(event) => event.stopPropagation()}
          >
            {row.display_name ?? row.name}
          </Link>
          {!row.is_active && <Badge tone="neutral">{t('common.inactive')}</Badge>}
        </span>
      ),
    },
    {
      key: 'email',
      header: t('customers.columns.email'),
      sortable: true,
      // Walk-in trade has no email, and the unique index allows that. An
      // address is isolated left-to-right so its punctuation stays in place
      // inside an Arabic row.
      cell: (row) =>
        row.email ? (
          <bdi dir="ltr">{row.email}</bdi>
        ) : (
          <span className="text-(--color-muted)">—</span>
        ),
    },
    /*
     * WHAT THIS REPLACED. Company and country used to sit here, and on the
     * demo data `company` was null for all sixty-eight customers while
     * `country` was the same two letters for all sixty-eight — two of the
     * table's four columns carrying no information at any width, while the
     * page's own description promised order history, lifetime value and
     * growth and showed none of the three. Both still exist, on the detail
     * screen, where an address belongs.
     *
     * They are computed from orders rather than stored, so they cannot go
     * stale, and they sort — which is the reason to put value in a column at
     * all. Sorting an address book by "date added" answers nothing.
     */
    {
      key: 'orders_count',
      header: t('customers.columns.orders'),
      sortable: true,
      numeric: true,
      width: '8rem',
      cell: (row) => formatNumber(row.orders_count ?? 0),
    },
    {
      key: 'lifetime_value',
      header: t('customers.columns.lifetimeValue'),
      sortable: true,
      numeric: true,
      primary: true,
      width: '11rem',
      /*
       * Null, not zero, for somebody who has never ordered — the server
       * sends no figure rather than a nought, because "nothing yet" and
       * "nothing spent" read identically as 0 and mean different things.
       */
      cell: (row) =>
        row.lifetime_value === null || row.lifetime_value === undefined ? (
          <span className="text-(--color-muted)">—</span>
        ) : (
          <span className="font-medium text-(--color-brand-text)">
            {formatMoney(row.lifetime_value)}
          </span>
        ),
    },
    {
      key: 'last_order_at',
      header: t('customers.columns.lastOrder'),
      sortable: true,
      numeric: true,
      width: '10rem',
      cell: (row) =>
        row.last_order_at ? (
          formatDate(row.last_order_at)
        ) : (
          <span className="text-(--color-muted)">{t('customers.columns.neverOrdered')}</span>
        ),
    },
  ];

  /*
   * The band above the table — server-counted over the whole matched set,
   * never summed from the rows on this page (ResultSummary).
   */
  const summary = [
    {
      key: 'matched',
      value: formatNumber(totals?.customers ?? meta?.total ?? 0),
      label: t('customers.summary.matched'),
    },
    {
      key: 'lifetime_value',
      value: formatMoney(totals?.lifetime_value),
      label: t('customers.summary.lifetimeValue'),
      tone: 'accent',
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.items.customers')}
        description={t('customers.description')}
        actions={
          /*
           * The most sensitive export in the system: the business's entire
           * commercial relationship map, and the one file a departing employee
           * has a motive to take. Gated on its own ability and audited.
           */
          <div className="flex flex-wrap items-start gap-2">
            {can('customers.export') && <ExportButton onExport={exportCustomers} filters={query} />}
            <Can ability="customers.create">
              <Button variant="primary" onClick={() => setCreating(true)}>
                {t('customers.form.action')}
              </Button>
            </Can>
          </div>
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder={t('customers.searchPlaceholder')}
          aria-label={t('customers.searchLabel')}
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-64"
        />
        <Select
          aria-label={t('catalog.activeState')}
          placeholder={t('customers.all')}
          options={[
            { value: 'true', label: t('catalog.activeOnly') },
            { value: 'false', label: t('catalog.inactiveOnly') },
          ]}
          value={filters.is_active ?? ''}
          onChange={(event) => setFilters({ is_active: event.target.value })}
          className="w-40"
        />
      </FilterBar>

      <Card padded={false}>
        <ResultSummary items={summary} loading={isLoading} />

        <DataTable
          caption={t('nav.items.customers')}
          columns={columns}
          rows={customers}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          onRowClick={(row) => router.push(`/customers/${row.id}`)}
          sort={filters.sort}
          onSortChange={setSort}
          activeFilters={describeFilters(activeKeys, filters, t)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title={t('customers.empty.title')}
              description={t('customers.empty.description')}
              action={
                <Can ability="customers.create">
                  <Button variant="primary" onClick={() => setCreating(true)}>
                    {t('customers.form.action')}
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

      <CustomerFormDialog
        key={creating ? 'open' : 'closed'}
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={() => refetch()}
      />
    </div>
  );
}
