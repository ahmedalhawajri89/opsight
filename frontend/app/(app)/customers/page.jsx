'use client';

import { useCustomers } from '@/features/catalog/useCatalog';
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
import { formatDate } from '@/lib/format';
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

  const { customers, meta, isLoading, isError, error, refetch } = useCustomers(query);

  const columns = [
    {
      key: 'name',
      header: t('customers.columns.customer'),
      sortable: true,
      cell: (row) => (
        <span className="flex items-center gap-2">
          {row.name}
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
    { key: 'company', header: t('customers.columns.company'), cell: (row) => row.company ?? '—' },
    {
      key: 'country',
      header: t('customers.columns.country'),
      width: '7rem',
      cell: (row) => row.country ?? '—',
    },
    {
      key: 'created_at',
      header: t('customers.columns.added'),
      sortable: true,
      numeric: true,
      width: '9rem',
      cell: (row) => formatDate(row.created_at),
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
          can('customers.export') ? (
            <ExportButton onExport={exportCustomers} filters={query} />
          ) : null
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
        <DataTable
          caption={t('nav.items.customers')}
          columns={columns}
          rows={customers}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          sort={filters.sort}
          onSortChange={setSort}
          activeFilters={describeFilters(activeKeys, filters, t)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title={t('customers.empty.title')}
              description={t('customers.empty.description')}
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
