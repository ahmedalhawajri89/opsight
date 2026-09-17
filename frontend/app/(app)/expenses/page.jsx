'use client';

import { useExpenseCategories } from '@/features/admin/useAdmin';
import { useExpenses } from '@/features/catalog/useCatalog';
import { useAuth } from '@/features/auth/AuthProvider';
import { DateInput, Input, Select } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { ExportButton } from '@/components/data/ExportButton';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatDate, formatMoney } from '@/lib/format';
import { exportExpenses } from '@/services/catalog';

const FILTER_CONFIG = {
  defaults: { sort: '-incurred_on', page: 1, per_page: 25 },
  allowed: [
    'search',
    'expense_category_id',
    'incurred_from',
    'incurred_to',
    'sort',
    'page',
    'per_page',
  ],
  sortable: ['incurred_on', 'amount', 'description', 'created_at'],
};

export default function ExpensesPage() {
  const { can } = useAuth();
  const { filters, setFilters, setPage, setSort, clearFilters, activeKeys } =
    useUrlFilters(FILTER_CONFIG);

  // The same object goes to the list and to the export, so "export" means
  // "export what I am looking at" rather than "export everything".
  const query = {
    page: filters.page,
    per_page: filters.per_page,
    sort: filters.sort,
    filter: {
      search: filters.search,
      expense_category_id: filters.expense_category_id,
      incurred_from: filters.incurred_from,
      incurred_to: filters.incurred_to,
    },
  };

  const { expenses, meta, isLoading, isError, error, refetch } = useExpenses(query);
  const { categories } = useExpenseCategories();

  const columns = [
    {
      key: 'incurred_on',
      header: 'Incurred',
      sortable: true,
      numeric: true,
      width: '9rem',
      // The business date, which may be backdated. Not the entry date.
      cell: (row) => formatDate(row.incurred_on),
    },
    { key: 'description', header: 'Description', sortable: true },
    {
      key: 'category',
      header: 'Category',
      width: '11rem',
      cell: (row) => row.category?.name ?? '—',
    },
    { key: 'vendor', header: 'Vendor', width: '12rem', cell: (row) => row.vendor ?? '—' },
    {
      key: 'amount',
      header: 'Amount',
      sortable: true,
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.amount),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Expenses"
        description="Operating costs only. Stock purchases reach profit through cost of goods at the point of sale — recording them here would count them twice."
        actions={
          can('expenses.export') ? <ExportButton onExport={exportExpenses} filters={query} /> : null
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder="Search description or vendor…"
          aria-label="Search expenses"
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-64"
        />
        <Select
          aria-label="Category"
          placeholder="Any category"
          value={filters.expense_category_id ?? ''}
          onChange={(event) => setFilters({ expense_category_id: event.target.value })}
          options={categories.map((category) => ({
            value: String(category.id),
            label: category.name,
          }))}
          className="w-44"
        />
        <DateInput
          aria-label="Incurred from"
          value={filters.incurred_from ?? ''}
          onChange={(event) => setFilters({ incurred_from: event.target.value })}
          className="w-40"
        />
        <DateInput
          aria-label="Incurred to"
          value={filters.incurred_to ?? ''}
          onChange={(event) => setFilters({ incurred_to: event.target.value })}
          className="w-40"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption="Expenses"
          columns={columns}
          rows={expenses}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          sort={filters.sort}
          onSortChange={setSort}
          activeFilters={activeKeys.map((key) => `${key}: ${filters[key]}`)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title="No expenses recorded"
              description="Without expenses, Opsight reports revenue rather than profit."
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
