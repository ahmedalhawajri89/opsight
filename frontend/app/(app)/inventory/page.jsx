'use client';

import { useState } from 'react';

import { useInventory, useStockActions } from '@/features/catalog/useCatalog';
import { useAuth } from '@/features/auth/AuthProvider';
import { Trans, useI18n } from '@/features/i18n/I18nProvider';
import { describeFilters } from '@/lib/i18n/filters';
import { Can } from '@/features/auth/Can';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { ExportButton } from '@/components/data/ExportButton';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatDateTime, formatNumber } from '@/lib/format';
import { exportInventory } from '@/services/catalog';

const FILTER_CONFIG = {
  defaults: { sort: 'stock_on_hand', page: 1, per_page: 25 },
  allowed: ['search', 'low_stock', 'sort', 'page', 'per_page'],
  sortable: ['stock_on_hand', 'last_movement_at'],
};

export default function InventoryPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const { filters, setFilters, setPage, setSort, clearFilters, activeKeys } =
    useUrlFilters(FILTER_CONFIG);

  const [adjusting, setAdjusting] = useState(null);

  /*
   * One object for the list and the export, so "export" means "export what I
   * am looking at". The server runs both through a single query definition,
   * so the file and the screen cannot drift apart.
   */
  const query = {
    page: filters.page,
    per_page: filters.per_page,
    sort: filters.sort,
    filter: { search: filters.search, low_stock: filters.low_stock },
  };

  const { items, meta, isLoading, isError, error, refetch } = useInventory(query);

  const columns = [
    {
      key: 'sku',
      header: t('orderDetail.columns.sku'),
      mono: true,
      width: '10rem',
      cell: (row) => row.product?.sku ?? '—',
    },
    {
      key: 'product',
      header: t('orderDetail.columns.product'),
      cell: (row) => (
        <span className="flex items-center gap-2">
          {row.product?.name ?? '—'}
          {row.is_low && <Badge tone="warning">{t('dashboard.lowStock.title')}</Badge>}
        </span>
      ),
    },
    {
      key: 'stock_on_hand',
      header: t('inventory.columns.onHand'),
      sortable: true,
      numeric: true,
      width: '8rem',
      cell: (row) => (
        <span className={row.is_low ? 'font-medium text-(--color-warning)' : undefined}>
          {formatNumber(row.stock_on_hand)}
        </span>
      ),
    },
    {
      key: 'threshold',
      header: t('inventory.columns.reorderAt'),
      numeric: true,
      width: '8rem',
      cell: (row) => formatNumber(row.threshold),
    },
    {
      key: 'last_movement_at',
      header: t('inventory.columns.lastMovement'),
      sortable: true,
      numeric: true,
      width: '12rem',
      cell: (row) => formatDateTime(row.last_movement_at),
    },
    {
      key: 'actions',
      header: '',
      width: '7rem',
      cell: (row) => (
        <Can ability="inventory.adjust">
          <Button
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              setAdjusting(row);
            }}
          >
            {t('inventory.adjust')}
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.items.inventory')}
        description={t('inventory.description')}
        actions={
          can('inventory.export') ? (
            <ExportButton onExport={exportInventory} filters={query} />
          ) : null
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder={t('inventory.searchPlaceholder')}
          aria-label={t('inventory.searchLabel')}
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-64"
        />
        <Select
          aria-label={t('catalog.stockLevel')}
          placeholder={t('products.all')}
          options={[{ value: 'true', label: t('catalog.lowStockOnly') }]}
          value={filters.low_stock ?? ''}
          onChange={(event) => setFilters({ low_stock: event.target.value })}
          className="w-44"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption={t('nav.items.inventory')}
          columns={columns}
          rows={items}
          // An inventory row is keyed by its product: the resource exposes
          // product_id rather than an id of its own, because the row IS the
          // stock state of that product.
          getRowId={(row) => row.product_id}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          sort={filters.sort}
          onSortChange={setSort}
          activeFilters={describeFilters(activeKeys, filters, t)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title={t('inventory.empty.title')}
              description={t('inventory.empty.description')}
            />
          }
        />
        <Pagination
          meta={meta}
          onPageChange={setPage}
          onPerPageChange={(perPage) => setFilters({ per_page: perPage })}
        />
      </Card>

      <AdjustStockDialog item={adjusting} onClose={() => setAdjusting(null)} onDone={refetch} />
    </div>
  );
}

/**
 * Stock adjustment.
 *
 * Takes a DELTA, not a target value. "Set stock to 40" is ambiguous under
 * concurrency and leaves no record of what actually changed; "+5" composes and
 * is auditable (MVP_SCOPE.md §6.6).
 */
function AdjustStockDialog({ item, onClose, onDone }) {
  const { t } = useI18n();
  const { adjust, restock } = useStockActions();

  const [mode, setMode] = useState('adjust');
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('adjustment');
  const [unitCost, setUnitCost] = useState('');
  const [failure, setFailure] = useState(null);

  if (!item) return null;

  async function submit() {
    setFailure(null);

    try {
      if (mode === 'restock') {
        await restock.mutateAsync({
          productId: item.product_id,
          quantity: Number(delta),
          unit_cost: unitCost === '' ? null : unitCost,
          note: note || null,
        });
      } else {
        await adjust.mutateAsync({
          productId: item.product_id,
          quantity_delta: Number(delta),
          note,
          reason,
        });
      }

      onDone?.();
      onClose();
      setDelta('');
      setNote('');
      setUnitCost('');
    } catch (error) {
      setFailure(error.fieldErrors?.quantity_delta ?? error.fieldErrors?.note ?? error.message);
    }
  }

  const pending = adjust.isPending || restock.isPending;

  return (
    <Dialog
      open={Boolean(item)}
      onClose={onClose}
      title={t('inventory.dialog.title', { product: item.product?.name ?? '' })}
      description={t('inventory.dialog.current', { count: formatNumber(item.stock_on_hand) })}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={pending} onClick={submit} disabled={!delta}>
            {mode === 'restock' ? t('inventory.dialog.receive') : t('inventory.dialog.apply')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {failure && (
          <p role="alert" className="text-[0.8125rem] text-(--color-negative)">
            {failure}
          </p>
        )}

        <Field label={t('inventory.dialog.type')}>
          {(props) => (
            <Select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              options={[
                { value: 'adjust', label: t('inventory.dialog.typeAdjust') },
                { value: 'restock', label: t('inventory.dialog.typeRestock') },
              ]}
              {...props}
            />
          )}
        </Field>

        {mode === 'adjust' ? (
          <>
            <Field
              label={t('inventory.dialog.change')}
              required
              hint={t('inventory.dialog.changeHint', {
                remove: formatNumber(-3, { sign: true }),
                add: formatNumber(5, { sign: true }),
              })}
            >
              {(props) => (
                <NumberInput
                  placeholder="-3"
                  value={delta}
                  onChange={(event) => setDelta(event.target.value)}
                  {...props}
                />
              )}
            </Field>

            <Field label={t('orderDetail.reason')}>
              {(props) => (
                <Select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  options={[
                    { value: 'adjustment', label: t('inventory.dialog.reasonCount') },
                    { value: 'damage', label: t('inventory.dialog.reasonDamage') },
                    { value: 'loss', label: t('inventory.dialog.reasonLoss') },
                  ]}
                  {...props}
                />
              )}
            </Field>
          </>
        ) : (
          <>
            <Field label={t('inventory.dialog.quantityReceived')} required>
              {(props) => (
                <NumberInput
                  placeholder="50"
                  value={delta}
                  onChange={(event) => setDelta(event.target.value)}
                  {...props}
                />
              )}
            </Field>

            <Field
              label={t('orderDetail.columns.unitCost')}
              hint={t('inventory.dialog.unitCostHint')}
            >
              {(props) => (
                <NumberInput
                  placeholder="0.0000"
                  value={unitCost}
                  onChange={(event) => setUnitCost(event.target.value)}
                  {...props}
                />
              )}
            </Field>
          </>
        )}

        <Field
          label={t('inventory.dialog.note')}
          required={mode === 'adjust'}
          hint={t('inventory.dialog.noteHint')}
        >
          {(props) => (
            <Textarea
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              {...props}
            />
          )}
        </Field>

        {mode === 'restock' && (
          <p className="text-[0.8125rem] text-(--color-text-subtle)">
            <Trans
              k="inventory.dialog.noExpense"
              tags={{ strong: (text) => <strong>{text}</strong> }}
            />
          </p>
        )}
      </div>
    </Dialog>
  );
}
