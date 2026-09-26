'use client';

import { useExpenseCategories } from '@/features/admin/useAdmin';
import { useState } from 'react';

import { useExpenses } from '@/features/catalog/useCatalog';
import { ExpenseFormDialog } from '@/features/catalog/ExpenseFormDialog';
import { Can } from '@/features/auth/Can';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { describeFilters } from '@/lib/i18n/filters';
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
  const { t } = useI18n();
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
  // null means "no dialog"; an expense means edit; 'new' means create.
  const [editing, setEditing] = useState(null);
  const { categories } = useExpenseCategories();

  const columns = [
    {
      key: 'incurred_on',
      header: t('expenses.columns.incurred'),
      sortable: true,
      numeric: true,
      width: '9rem',
      // The business date, which may be backdated. Not the entry date.
      cell: (row) => formatDate(row.incurred_on),
    },
    {
      key: 'description',
      header: t('expenses.columns.description'),
      sortable: true,
      // Reachable from a keyboard, not only by clicking the row.
      cell: (row) =>
        can('expenses.update') ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setEditing(row);
            }}
            className="text-start text-(--color-brand-text) hover:underline"
          >
            {row.description}
          </button>
        ) : (
          row.description
        ),
    },
    {
      key: 'category',
      header: t('products.columns.category'),
      width: '11rem',
      cell: (row) => row.category?.name ?? '—',
    },
    {
      key: 'vendor',
      header: t('expenses.columns.vendor'),
      width: '12rem',
      cell: (row) => row.vendor ?? '—',
    },
    {
      key: 'amount',
      header: t('expenses.columns.amount'),
      sortable: true,
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.amount),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.items.expenses')}
        description={t('expenses.description')}
        actions={
          <div className="flex flex-wrap items-start gap-2">
            {can('expenses.export') && <ExportButton onExport={exportExpenses} filters={query} />}
            <Can ability="expenses.create">
              <Button variant="primary" onClick={() => setEditing('new')}>
                {t('expenses.form.action')}
              </Button>
            </Can>
          </div>
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder={t('expenses.searchPlaceholder')}
          aria-label={t('expenses.searchLabel')}
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-64"
        />
        <Select
          aria-label={t('filters.expense_category_id')}
          placeholder={t('expenses.anyCategory')}
          value={filters.expense_category_id ?? ''}
          onChange={(event) => setFilters({ expense_category_id: event.target.value })}
          options={categories.map((category) => ({
            value: String(category.id),
            label: category.name,
          }))}
          className="w-44"
        />
        <DateInput
          aria-label={t('filters.incurred_from')}
          value={filters.incurred_from ?? ''}
          onChange={(event) => setFilters({ incurred_from: event.target.value })}
          className="w-40"
        />
        <DateInput
          aria-label={t('filters.incurred_to')}
          value={filters.incurred_to ?? ''}
          onChange={(event) => setFilters({ incurred_to: event.target.value })}
          className="w-40"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption={t('nav.items.expenses')}
          columns={columns}
          rows={expenses}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          onRowClick={can('expenses.update') ? (row) => setEditing(row) : undefined}
          sort={filters.sort}
          onSortChange={setSort}
          activeFilters={describeFilters(activeKeys, filters, t)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title={t('expenses.empty.title')}
              description={t('expenses.empty.description')}
              action={
                <Can ability="expenses.create">
                  <Button variant="primary" onClick={() => setEditing('new')}>
                    {t('expenses.form.action')}
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

      <ExpenseFormDialog
        key={editing === null ? 'closed' : (editing.id ?? 'new')}
        open={editing !== null}
        expense={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onSaved={() => refetch()}
      />
    </div>
  );
}
