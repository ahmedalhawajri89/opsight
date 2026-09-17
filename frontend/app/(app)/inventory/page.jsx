'use client';

import { useState } from 'react';

import { useInventory, useStockActions } from '@/features/catalog/useCatalog';
import { useAuth } from '@/features/auth/AuthProvider';
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
      header: 'SKU',
      mono: true,
      width: '10rem',
      cell: (row) => row.product?.sku ?? '—',
    },
    {
      key: 'product',
      header: 'Product',
      cell: (row) => (
        <span className="flex items-center gap-2">
          {row.product?.name ?? '—'}
          {row.is_low && <Badge tone="warning">Low stock</Badge>}
        </span>
      ),
    },
    {
      key: 'stock_on_hand',
      header: 'On hand',
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
      header: 'Reorder at',
      numeric: true,
      width: '8rem',
      cell: (row) => formatNumber(row.threshold),
    },
    {
      key: 'last_movement_at',
      header: 'Last movement',
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
            Adjust
          </Button>
        </Can>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Stock on hand is a cache over an append-only ledger. Every change is recorded with a reason."
        actions={
          can('inventory.export') ? (
            <ExportButton onExport={exportInventory} filters={query} />
          ) : null
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder="Search product or SKU…"
          aria-label="Search inventory"
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-64"
        />
        <Select
          aria-label="Stock level"
          placeholder="All products"
          options={[{ value: 'true', label: 'Low stock only' }]}
          value={filters.low_stock ?? ''}
          onChange={(event) => setFilters({ low_stock: event.target.value })}
          className="w-44"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption="Inventory"
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
          activeFilters={activeKeys.map((key) => `${key}: ${filters[key]}`)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title="No stock records yet"
              description="Every product gets an inventory row when it is created."
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
      title={`Adjust stock — ${item.product?.name ?? ''}`}
      description={`Currently ${formatNumber(item.stock_on_hand)} on hand.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="primary" loading={pending} onClick={submit} disabled={!delta}>
            {mode === 'restock' ? 'Receive stock' : 'Apply adjustment'}
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

        <Field label="Type">
          {(props) => (
            <Select
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              options={[
                { value: 'adjust', label: 'Correction, damage or loss' },
                { value: 'restock', label: 'Receiving stock' },
              ]}
              {...props}
            />
          )}
        </Field>

        {mode === 'adjust' ? (
          <>
            <Field
              label="Change"
              required
              hint="A signed delta: -3 removes three units, +5 adds five."
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

            <Field label="Reason">
              {(props) => (
                <Select
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  options={[
                    { value: 'adjustment', label: 'Stock count correction' },
                    { value: 'damage', label: 'Damaged' },
                    { value: 'loss', label: 'Lost' },
                  ]}
                  {...props}
                />
              )}
            </Field>
          </>
        ) : (
          <>
            <Field label="Quantity received" required>
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
              label="Unit cost"
              hint="Recorded on the movement. It does not change the product's catalog cost."
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
          label="Note"
          required={mode === 'adjust'}
          hint="An unexplained stock change is indistinguishable from theft when someone reviews the ledger later."
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
            Receiving stock does <strong>not</strong> create an expense. Stock cost reaches profit
            through cost of goods at the point of sale — recording it as an expense too would count
            it twice.
          </p>
        )}
      </div>
    </Dialog>
  );
}
