'use client';

import { useState } from 'react';

import { Badge, OrderStatusBadge, PartialBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  Checkbox,
  DateInput,
  Field,
  Input,
  NumberInput,
  Radio,
  Select,
  Textarea,
} from '@/components/ui/Field';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { InfoTip, Tooltip } from '@/components/ui/Tooltip';
import { Skeleton, SkeletonStatTile, SkeletonTable, SkeletonText } from '@/components/ui/Skeleton';
import { ComparisonValue } from '@/components/data/ComparisonValue';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { StatGrid, StatTile } from '@/components/data/StatTile';
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { PeriodSelector } from '@/components/layout/PeriodSelector';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';

/**
 * Component gallery — development only.
 *
 * Every component, in every state, in whichever theme the browser is set to.
 * This is the fastest way to catch a broken empty state or an unreadable
 * dark-mode token, and it costs one route (UI_UX_DIRECTION.md §11).
 *
 * It is NOT a product surface: it is excluded from navigation, and it refuses
 * to render outside development.
 */
export default function GalleryPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sort, setSort] = useState('-placed_at');
  const [page, setPage] = useState(2);

  /*
   * Gated on an explicit flag, not NODE_ENV.
   *
   * A real deployment simply never sets it. The end-to-end suite does, so this
   * page is verified in the same production build as every other screen rather
   * than only in a dev server that ships to nobody.
   */
  if (process.env.NEXT_PUBLIC_ENABLE_GALLERY !== 'true') {
    return <ForbiddenState />;
  }

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="Component gallery"
        description="Development only. Every component in every state — switch your OS theme to check both."
        actions={<Badge tone="warning">Not a product surface</Badge>}
      />

      <Section title="Buttons">
        <Row label="Variants">
          <Button variant="primary">Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Cancel order</Button>
        </Row>
        <Row label="Sizes">
          <Button size="sm">Small</Button>
          <Button size="md">Medium</Button>
          <Button size="lg">Large</Button>
        </Row>
        <Row label="States">
          <Button variant="primary" loading>
            Saving
          </Button>
          <Button variant="primary" disabled>
            Disabled
          </Button>
          <Button variant="danger" loading>
            Cancelling
          </Button>
        </Row>
      </Section>

      <Section title="Form controls">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Customer name" required hint="As it appears on the invoice">
            {(props) => <Input placeholder="Acme Trading" {...props} />}
          </Field>

          <Field label="Unit price" hint="Excludes tax">
            {(props) => <NumberInput placeholder="0.000" defaultValue="24.500" {...props} />}
          </Field>

          <Field label="Order date">
            {(props) => <DateInput defaultValue="2026-09-16" {...props} />}
          </Field>

          <Field label="Status">
            {(props) => (
              <Select
                placeholder="Any status"
                options={[
                  { value: 'draft', label: 'Draft' },
                  { value: 'confirmed', label: 'Confirmed' },
                  { value: 'fulfilled', label: 'Fulfilled' },
                ]}
                {...props}
              />
            )}
          </Field>

          <Field label="SKU" error="This SKU is already in use.">
            {(props) => <Input defaultValue="TRD-0041" {...props} />}
          </Field>

          <Field label="Notes">
            {(props) => <Textarea placeholder="Internal notes…" {...props} />}
          </Field>
        </div>

        <Row label="Toggles">
          <Checkbox label="Only low stock" defaultChecked />
          <Checkbox label="Include cancelled" />
          <Checkbox label="Disabled" disabled />
          <Radio name="gallery-density" label="Comfortable" defaultChecked />
          <Radio name="gallery-density" label="Compact" />
        </Row>
      </Section>

      <Section title="Badges">
        <Row label="Order status">
          {['draft', 'confirmed', 'fulfilled', 'cancelled', 'refunded'].map((status) => (
            <OrderStatusBadge key={status} status={status} />
          ))}
        </Row>
        <Row label="Tones">
          <Badge tone="neutral">Neutral</Badge>
          <Badge tone="accent">Accent</Badge>
          <Badge tone="positive">Positive</Badge>
          <Badge tone="negative">Negative</Badge>
          <Badge tone="warning">Warning</Badge>
          <PartialBadge />
        </Row>
      </Section>

      <Section
        title="Comparison values"
        note="Tone follows the metric's favourable direction, not the sign of the number."
      >
        <div className="grid gap-3 md:grid-cols-2">
          <Demo label="Revenue up (up is good)">
            <ComparisonValue change={0.096} favourable="up" basis="vs previous 30 days" />
          </Demo>
          <Demo label="Revenue down (up is good)">
            <ComparisonValue change={-0.152} favourable="up" basis="vs previous 30 days" />
          </Demo>
          <Demo label="Expenses up (down is good) — still bad news">
            <ComparisonValue change={0.41} favourable="down" basis="vs previous 30 days" />
          </Demo>
          <Demo label="Cancellations down (down is good) — good news">
            <ComparisonValue change={-0.05} favourable="down" basis="vs previous 30 days" />
          </Demo>
          <Demo label="Margin, in percentage points">
            <ComparisonValue
              change={-0.042}
              format="points"
              favourable="up"
              basis="vs previous 30 days"
            />
          </Demo>
          <Demo label="No comparison possible (previous period was zero)">
            <ComparisonValue change={null} basis="vs previous 30 days" />
          </Demo>
        </div>
      </Section>

      <Section title="Stat tiles">
        <StatGrid>
          <StatTile
            label="Net revenue"
            value={formatMoney('48210.5', { currency: 'BHD', decimals: 3 })}
            definition="Subtotal less discounts and refunds, for orders placed in this period. Excludes tax and shipping."
            change={0.096}
            favourable="up"
            comparisonBasis="vs previous 30 days"
            previousLabel={formatMoney('43990', { currency: 'BHD', decimals: 3 })}
          />
          <StatTile
            label="Orders"
            value={formatNumber(312)}
            change={0.047}
            favourable="up"
            comparisonBasis="vs previous 30 days"
          />
          <StatTile
            label="Gross margin"
            value={formatPercent(0.3841)}
            definition="Gross profit as a proportion of net revenue."
            change={-0.042}
            changeFormat="points"
            favourable="up"
            comparisonBasis="vs previous 30 days"
          />
          <StatTile
            label="Average order value"
            value={null}
            emptyReason="No orders in this period, so there is no average to compute."
            change={null}
            comparisonBasis="vs previous 30 days"
          />
          <StatTile
            label="Operating expenses"
            value={formatMoney('12400', { currency: 'BHD', decimals: 3 })}
            change={0.41}
            favourable="down"
            comparisonBasis="vs previous 30 days"
          />
          <StatTile
            label="Revenue (in progress)"
            value={formatMoney('9120.25', { currency: 'BHD', decimals: 3 })}
            partial
            change={0.02}
            favourable="up"
            comparisonBasis="vs previous 30 days"
          />
          <StatTile label="Loading" loading />
          <SkeletonStatTile />
        </StatGrid>
      </Section>

      <Section title="Period selector">
        <PeriodSelector onChange={() => {}} />
      </Section>

      <Section title="Data table">
        <DataTable
          caption="Example orders"
          columns={TABLE_COLUMNS}
          rows={TABLE_ROWS}
          sort={sort}
          onSortChange={setSort}
          onRowClick={() => {}}
        />
        <Pagination
          meta={{ current_page: page, last_page: 17, per_page: 25, total: 417 }}
          onPageChange={setPage}
          onPerPageChange={() => {}}
          className="rounded-b-[--radius-md] border border-t-0 border-[--color-line] bg-[--color-surface]"
        />
      </Section>

      <Section title="Table states" note="Empty and filtered-empty are deliberately different.">
        <div className="grid gap-3 lg:grid-cols-2">
          <Demo label="Loading — correct column count, so nothing jumps">
            <DataTable columns={TABLE_COLUMNS} rows={[]} loading />
          </Demo>
          <Demo label="Empty — nothing exists yet">
            <DataTable
              columns={TABLE_COLUMNS}
              rows={[]}
              empty={
                <EmptyState
                  title="No orders yet"
                  description="Orders you create will appear here with their status and totals."
                  action={<Button variant="primary">New order</Button>}
                />
              }
            />
          </Demo>
          <Demo label="Filtered empty — records exist, filters exclude them">
            <DataTable
              columns={TABLE_COLUMNS}
              rows={[]}
              activeFilters={['status: cancelled', 'August 2026']}
              onClearFilters={() => {}}
            />
          </Demo>
          <Demo label="Error — scoped to the widget, with a reference id">
            <DataTable
              columns={TABLE_COLUMNS}
              rows={[]}
              error={{ message: 'Could not reach the server.', reference: '8f2c-41ab-9d30' }}
              onRetry={() => {}}
            />
          </Demo>
        </div>
      </Section>

      <Section title="Other states">
        <div className="grid gap-3 lg:grid-cols-3">
          <Demo label="No results">
            <Card padded={false}>
              <NoResultsState activeFilters={['search: "INV-99"']} onClear={() => {}} />
            </Card>
          </Demo>
          <Demo label="Error">
            <Card padded={false}>
              <ErrorState
                error={{ message: 'The analytics service timed out.' }}
                onRetry={() => {}}
              />
            </Card>
          </Demo>
          <Demo label="Forbidden">
            <Card padded={false}>
              <ForbiddenState />
            </Card>
          </Demo>
        </div>
      </Section>

      <Section title="Skeletons">
        <div className="grid gap-4 lg:grid-cols-3">
          <Demo label="Text">
            <SkeletonText lines={4} />
          </Demo>
          <Demo label="Blocks">
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-8 w-2/3" />
            </div>
          </Demo>
          <Demo label="Table">
            <SkeletonTable columns={3} rows={3} />
          </Demo>
        </div>
      </Section>

      <Section title="Overlays">
        <Row label="Tooltips">
          <Tooltip content="Appears on hover and on focus — reachable by keyboard.">
            <Button>Hover or focus me</Button>
          </Tooltip>
          <span className="inline-flex items-center gap-1.5 text-sm text-[--color-text-muted]">
            Net revenue
            <InfoTip
              label="Net revenue"
              content="Subtotal less discounts and refunds, for orders placed in this period."
            />
          </span>
        </Row>

        <Row label="Dialogs">
          <Button onClick={() => setDialogOpen(true)}>Open dialog</Button>
          <Button variant="danger" onClick={() => setConfirmOpen(true)}>
            Destructive confirm
          </Button>
        </Row>

        <Dialog
          open={dialogOpen}
          onClose={() => setDialogOpen(false)}
          title="Example dialog"
          description="Escape closes it, focus is trapped, and focus returns to the trigger."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={() => setDialogOpen(false)}>
                Save
              </Button>
            </>
          }
        >
          <p className="text-[--color-text-muted]">
            Built on the native &lt;dialog&gt; element, so focus trapping and the top layer come
            from the platform rather than from hand-written key handlers.
          </p>
        </Dialog>

        <ConfirmDialog
          open={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => setConfirmOpen(false)}
          title="Cancel order ORD-2026-000418?"
          consequence="This returns 12 units to stock and removes BHD 840.000 from August revenue. The order stays on record as cancelled."
          confirmLabel="Cancel order"
        />
      </Section>

      <Section title="Colour tokens" note="Verified against WCAG AA by tests/contrast.test.js.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SWATCHES.map((group) => (
            <div key={group.title} className="space-y-1.5">
              <p className="text-[0.6875rem] font-medium uppercase tracking-wide text-[--color-text-muted]">
                {group.title}
              </p>
              {group.tokens.map((token) => (
                <div key={token} className="flex items-center gap-2">
                  <span
                    className="size-5 shrink-0 rounded-[2px] border border-[--color-line]"
                    style={{ background: `var(${token})` }}
                    aria-hidden="true"
                  />
                  <code className="font-mono text-[0.6875rem] text-[--color-text-muted]">
                    {token}
                  </code>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Section({ title, note, children }) {
  return (
    <section className="space-y-3">
      <div className="border-b border-[--color-line] pb-1.5">
        <h2 className="text-sm font-semibold text-[--color-text]">{title}</h2>
        {note && <p className="mt-0.5 text-[0.8125rem] text-[--color-text-muted]">{note}</p>}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-[0.6875rem] uppercase tracking-wide text-[--color-text-subtle]">
        {label}
      </span>
      {children}
    </div>
  );
}

function Demo({ label, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[0.6875rem] uppercase tracking-wide text-[--color-text-subtle]">{label}</p>
      {children}
    </div>
  );
}

const TABLE_COLUMNS = [
  { key: 'reference', header: 'Order', sortable: true, mono: true, width: '12rem' },
  { key: 'customer', header: 'Customer', sortable: true },
  {
    key: 'status',
    header: 'Status',
    width: '9rem',
    cell: (row) => <OrderStatusBadge status={row.status} />,
  },
  { key: 'placed_at', header: 'Placed', sortable: true, numeric: true, width: '9rem' },
  {
    key: 'total_amount',
    header: 'Total',
    sortable: true,
    numeric: true,
    width: '10rem',
    cell: (row) => formatMoney(row.total_amount, { currency: 'BHD', decimals: 3 }),
  },
];

const TABLE_ROWS = [
  {
    id: 1,
    reference: 'ORD-2026-000418',
    customer: 'Acme Trading',
    status: 'fulfilled',
    placed_at: '31 Aug 2026',
    total_amount: '1240.500',
  },
  {
    id: 2,
    reference: 'ORD-2026-000417',
    customer: 'Gulf Supplies',
    status: 'confirmed',
    placed_at: '30 Aug 2026',
    total_amount: '89.000',
  },
  {
    id: 3,
    reference: 'ORD-2026-000416',
    customer: 'Manama Retail',
    status: 'cancelled',
    placed_at: '29 Aug 2026',
    total_amount: '3410.750',
  },
  {
    id: 4,
    reference: 'ORD-2026-000415',
    customer: 'Walk-in',
    status: 'refunded',
    placed_at: '28 Aug 2026',
    total_amount: '215.000',
  },
  {
    id: 5,
    reference: 'ORD-2026-000414',
    customer: 'Bahrain Foods',
    status: 'draft',
    placed_at: '—',
    total_amount: '0.000',
  },
];

const SWATCHES = [
  {
    title: 'Surfaces',
    tokens: [
      '--surface',
      '--surface-sunken',
      '--surface-raised',
      '--surface-hover',
      '--surface-selected',
    ],
  },
  {
    title: 'Lines & text',
    tokens: ['--border', '--border-strong', '--text', '--text-muted', '--text-subtle'],
  },
  { title: 'Accent', tokens: ['--accent', '--accent-hover', '--accent-subtle', '--accent-text'] },
  { title: 'Semantic', tokens: ['--positive', '--negative', '--warning', '--info'] },
  {
    title: 'Semantic subtle',
    tokens: ['--positive-subtle', '--negative-subtle', '--warning-subtle', '--info-subtle'],
  },
  {
    title: 'Chart series',
    tokens: ['--series-1', '--series-2', '--series-3', '--series-4', '--series-5', '--series-6'],
  },
];
