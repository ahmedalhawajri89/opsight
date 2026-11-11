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
import { DetailHero, DetailList, DetailSection, DetailSheet } from '@/components/ui/DetailSheet';
import { BreakdownChart } from '@/components/charts/BreakdownChart';
import { CashFlowChart } from '@/components/charts/CashFlowChart';
import { TrendChart } from '@/components/charts/TrendChart';
import { WaterfallChart } from '@/components/charts/WaterfallChart';
import {
  GalleryFilter,
  GalleryRail,
  GallerySection,
  IconLibrary,
  PreviewToolbar,
  ShapeScale,
  Swatches,
  TypeScale,
} from '@/features/gallery/GalleryKit';

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState('');

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
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Component gallery"
        description="Every component in every state, in either theme and either direction. The browser suite opens this page in the production build, so a component that breaks here stops the build."
        actions={<Badge tone="warning">Development only</Badge>}
      />

      <div className="sticky top-14 z-10 -mx-1 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface)/95 px-3 py-2 backdrop-blur">
        <PreviewToolbar query={query} onQuery={setQuery} />
      </div>

      <div className="gap-8 lg:grid lg:grid-cols-[12rem_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <GalleryRail query={query} />
        </aside>

        <GalleryFilter query={query}>
          <div className="min-w-0 space-y-6">
            <GallerySection
              title="Colour tokens"
              note="Every colour in the product, as the token to use and the value it resolves to in the current theme. Click to copy. Contrast is checked against WCAG AA by tests/contrast.test.js."
            >
              <Swatches groups={SWATCHES} />
            </GallerySection>

            <GallerySection
              title="Typography"
              note="Six sizes, in IBM Plex Sans Arabic for both scripts. A size outside this scale is a bug (UI_UX_DIRECTION.md §3)."
            >
              <TypeScale />
            </GallerySection>

            <GallerySection
              title="Shape & elevation"
              note="Three corner radii and two shadows. A card has a border or a shadow, never both."
            >
              <ShapeScale />
            </GallerySection>

            <GallerySection
              title="Icons"
              note="One stroke weight, drawn in currentColor, so an icon takes the colour of the text beside it."
              use="import { Icon } from '@/components/ui/Icon';"
            >
              <IconLibrary />
            </GallerySection>

            <GallerySection
              title="Buttons"
              note="Four variants, three sizes. One primary action per view."
              use="import { Button } from '@/components/ui/Button';"
            >
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
            </GallerySection>

            <GallerySection
              title="Form controls"
              note="Every control sits in a Field, which ties the label, hint and error to it for assistive technology."
              use="import { Field, Input, Select } from '@/components/ui/Field';"
            >
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
            </GallerySection>

            <GallerySection
              title="Badges"
              note="Status in words and colour together, never colour alone."
              use="import { Badge } from '@/components/ui/Badge';"
            >
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
            </GallerySection>

            <GallerySection
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
            </GallerySection>

            <GallerySection
              title="Stat tiles"
              note="A figure, its definition and its comparison. No value is an em dash with a reason, never a zero."
              use="import { StatTile } from '@/components/data/StatTile';"
            >
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
            </GallerySection>

            <GallerySection
              title="Period selector"
              note="Presets and custom ranges, kept in the URL so a period survives a reload and can be shared."
              use="import { PeriodSelector } from '@/components/layout/PeriodSelector';"
            >
              <PeriodSelector onChange={() => {}} />
            </GallerySection>

            <GallerySection
              title="Overlays"
              note="Native <dialog>: focus trapped and returned, Escape closes, and the shared motion from globals.css."
              use="import { Dialog, ConfirmDialog } from '@/components/ui/Dialog';"
            >
              <Row label="Tooltips">
                <Tooltip content="Appears on hover and on focus — reachable by keyboard.">
                  <Button>Hover or focus me</Button>
                </Tooltip>
                <span className="inline-flex items-center gap-1.5 text-base text-(--color-text-2)">
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
                <p className="text-(--color-text-2)">
                  Built on the native &lt;dialog&gt; element, so focus trapping and the top layer
                  come from the platform rather than from hand-written key handlers.
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
            </GallerySection>

            <GallerySection
              title="Detail sheet"
              note="A record opened without leaving its list: header, the figure it exists for, facts as rows, actions. Slides in from the reading end."
              use="import { DetailSheet } from '@/components/ui/DetailSheet';"
            >
              <Button onClick={() => setSheetOpen(true)}>Open detail sheet</Button>
              <DetailSheet
                open={sheetOpen}
                onClose={() => setSheetOpen(false)}
                title="Warehouse air-conditioning repair"
                subtitle="Operating expense · 9 November 2026"
                hero={
                  <DetailHero
                    label="Amount"
                    value={formatMoney('645.63', { currency: 'BHD', decimals: 3 })}
                    badge={<Badge>Maintenance</Badge>}
                  />
                }
                footer={
                  <Button variant="primary" onClick={() => setSheetOpen(false)}>
                    Edit expense
                  </Button>
                }
              >
                <DetailSection title="Details">
                  <DetailList
                    items={[
                      { label: 'Incurred', value: '9 Nov 2026' },
                      { label: 'Vendor', value: 'Dilmun Cooling' },
                      { label: 'Reference', value: null },
                    ]}
                  />
                </DetailSection>
              </DetailSheet>
            </GallerySection>

            <GallerySection
              title="Data table"
              note="Sorting in the URL, one row a click target, numbers right-aligned in tabular figures."
              use="import { DataTable } from '@/components/data/DataTable';"
            >
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
                className="rounded-b-(--radius-control) border border-t-0 border-(--color-line) bg-(--color-surface)"
              />
            </GallerySection>

            <GallerySection
              title="Table states"
              note="Empty and filtered-empty are deliberately different."
            >
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
            </GallerySection>

            <GallerySection title="Other states">
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
            </GallerySection>

            <GallerySection
              title="Skeletons"
              note="Shaped like what they stand in for, so nothing jumps when the data arrives."
              use="import { Skeleton } from '@/components/ui/Skeleton';"
            >
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
            </GallerySection>

            <GallerySection
              title="Ranking"
              note="A leaderboard, not a bar chart: each bar is measured against the leader, and Other is a summary line rather than a competitor."
              use="import { BreakdownChart } from '@/components/charts/BreakdownChart';"
            >
              <BreakdownChart
                title="Net revenue by product"
                rows={RANKING_ROWS}
                currency="BHD"
                decimals={3}
              />
            </GallerySection>

            <GallerySection
              title="Revenue to profit"
              note="The arithmetic written out, then where the revenue went. A loss runs past the revenue marker."
              use="import { WaterfallChart } from '@/components/charts/WaterfallChart';"
            >
              <WaterfallChart
                title="From revenue to profit"
                steps={PROFIT_STEPS}
                margins={{ gross_profit: 0.4, net_profit: 0.1 }}
                currency="BHD"
                decimals={3}
              />
            </GallerySection>

            <GallerySection
              title="Trend"
              note="With summary on: total, average, highest, lowest and the latest change. The month still filling is shaded and kept out of highest and latest."
              use="import { TrendChart } from '@/components/charts/TrendChart';"
            >
              <TrendChart
                title="Net revenue"
                series={TREND_SERIES}
                currency="BHD"
                decimals={3}
                summary
                height={260}
              />
            </GallerySection>

            <GallerySection
              title="Revenue and expenses"
              note="Revenue against operating expenses by month, with each colour beside its total."
              use="import { CashFlowChart } from '@/components/charts/CashFlowChart';"
            >
              <CashFlowChart data={CASH_FLOW} currency="BHD" decimals={3} />
            </GallerySection>
          </div>
        </GalleryFilter>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function Row({ label, children }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-24 shrink-0 text-xs uppercase tracking-wide text-(--color-muted)">
        {label}
      </span>
      {children}
    </div>
  );
}

function Demo({ label, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs uppercase tracking-wide text-(--color-muted)">{label}</p>
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

/* The palette, by role. Grouped exactly as globals.css groups it. */
const SWATCHES = [
  {
    title: 'Surfaces',
    tokens: ['--ground', '--surface', '--surface-subtle', '--surface-hover', '--surface-selected'],
  },
  {
    title: 'Lines & text',
    tokens: ['--border-subtle', '--border', '--border-strong', '--text', '--text-2', '--muted'],
  },
  { title: 'Brand', tokens: ['--brand', '--brand-hover', '--brand-text', '--brand-soft'] },
  { title: 'Accent', tokens: ['--accent', '--accent-strong', '--accent-soft'] },
  { title: 'Semantic', tokens: ['--success', '--warning', '--danger', '--info'] },
  {
    title: 'Semantic soft',
    tokens: ['--success-soft', '--warning-soft', '--danger-soft', '--info-soft'],
  },
  {
    title: 'Chart',
    tokens: ['--chart-1', '--chart-2', '--chart-3', '--chart-4', '--chart-5', '--chart-6'],
  },
];

/* Sample data for the chart sections. Shaped exactly as the API returns it. */

const RANKING_ROWS = [
  { key: '1', label: 'لابتوب ١٥ إنش Core i7 32GB', value: '17653.200', share: 0.112 },
  { key: '2', label: 'Meeting table for eight', value: '15426.000', share: 0.098 },
  { key: '3', label: 'Three-seat reception sofa', value: '14010.500', share: 0.089 },
  { key: '4', label: 'Executive desk 180 cm', value: '13695.250', share: 0.087 },
  { key: '5', label: 'Colour multifunction printer', value: '11500.000', share: 0.073 },
  { key: 'other', label: 'Other', value: '58270.050', share: 0.541, is_other: true },
];

const PROFIT_STEPS = [
  { key: 'net_revenue', kind: 'total', label: 'Net revenue', value: '40317.890' },
  { key: 'cogs', kind: 'down', label: 'Cost of goods sold', value: '24190.734' },
  { key: 'gross_profit', kind: 'total', label: 'Gross profit', value: '16127.156' },
  { key: 'operating_expenses', kind: 'down', label: 'Operating expenses', value: '12095.367' },
  { key: 'net_profit', kind: 'total', label: 'Net profit', value: '4031.789' },
];

const TREND_SERIES = [
  ['2026-06-01', '2026-06-30', '48210.500', false],
  ['2026-07-01', '2026-07-31', '52000.565', false],
  ['2026-08-01', '2026-08-31', '55175.305', false],
  ['2026-09-01', '2026-09-30', '50685.815', false],
  ['2026-10-01', '2026-10-31', '40317.890', false],
  ['2026-11-01', '2026-11-30', '24952.140', true],
].map(([bucket, bucket_end, value, is_partial]) => ({ bucket, bucket_end, value, is_partial }));

const CASH_FLOW = {
  period: { from: '2026-06-01', to: '2026-11-30' },
  revenue: TREND_SERIES,
  expenses: TREND_SERIES.map((bucket, i) => ({
    ...bucket,
    value: ['12400.000', '13120.500', '14294.770', '14241.200', '13980.000', '7010.400'][i],
  })),
};
