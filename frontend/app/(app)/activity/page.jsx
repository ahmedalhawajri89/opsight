'use client';

import { useActivity, useActivityActions } from '@/features/admin/useAdmin';
import { useAuth } from '@/features/auth/AuthProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateInput, Select } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { ExportButton } from '@/components/data/ExportButton';
import { EmptyState, ForbiddenState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatDateTime } from '@/lib/format';
import { exportActivity } from '@/services/admin';

/*
 * No `page`, no `sort`.
 *
 * This screen pages by CURSOR, because the audit log is the highest-growth
 * table in the system: `OFFSET 40000` makes the database walk forty thousand
 * rows to discard them, and gets slower exactly as the table fills. A cursor
 * seeks straight to the key.
 *
 * The second reason is correctness. Rows arrive constantly, so offset paging
 * shifts entries between pages while a reader is working through them — and an
 * audit tool that can skip an entry is not an audit tool.
 *
 * The price is that there is no page count and no "jump to page 40". Nobody
 * navigates to page 40 of an event stream; they filter it, which is what the
 * controls above are for.
 */
const FILTER_CONFIG = {
  defaults: { per_page: 50 },
  allowed: ['action', 'user_id', 'subject_type', 'from', 'to', 'cursor', 'per_page'],
  sortable: [],
};

export default function ActivityPage() {
  const { can } = useAuth();
  const { filters, setFilters, clearFilters, activeKeys } = useUrlFilters(FILTER_CONFIG);

  const { entries, nextCursor, prevCursor, isLoading, isError, error, refetch } = useActivity({
    per_page: filters.per_page,
    cursor: filters.cursor,
    filter: {
      action: filters.action,
      subject_type: filters.subject_type,
      from: filters.from,
      to: filters.to,
    },
  });

  const { actions } = useActivityActions();

  if (isError && error?.isForbidden) {
    return <ForbiddenState />;
  }

  const columns = [
    {
      key: 'occurred_at',
      header: 'When',
      numeric: true,
      width: '12rem',
      cell: (row) => formatDateTime(row.occurred_at),
    },
    {
      key: 'action',
      header: 'Action',
      width: '13rem',
      cell: (row) => <ActionBadge action={row.action} />,
    },
    {
      key: 'actor',
      header: 'Who',
      width: '14rem',
      // Null for a failed sign-in: whoever submitted it did not prove they
      // were the account holder, so the row names no actor.
      cell: (row) =>
        row.actor ? (
          <span>
            {row.actor.name}
            <span className="ms-1.5 text-[--color-text-subtle]">{row.actor.role_label}</span>
          </span>
        ) : (
          <span className="text-[--color-text-subtle]">Not signed in</span>
        ),
    },
    {
      key: 'subject',
      header: 'Subject',
      width: '10rem',
      cell: (row) =>
        row.subject_type ? `${row.subject_type} ${row.subject_id ?? ''}`.trim() : '—',
    },
    {
      key: 'changes',
      header: 'Detail',
      cell: (row) => <Detail changes={row.changes} context={row.context} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Activity log"
        description="Append-only. Nothing in this application can edit or delete an entry, and every export of it is itself recorded here."
        actions={
          can('activity.export') ? (
            <ExportButton
              onExport={exportActivity}
              filters={{
                per_page: filters.per_page,
                filter: {
                  action: filters.action,
                  subject_type: filters.subject_type,
                  from: filters.from,
                  to: filters.to,
                },
              }}
            />
          ) : null
        }
      />

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Select
          aria-label="Action"
          placeholder="Any action"
          value={filters.action ?? ''}
          onChange={(event) => setFilters({ action: event.target.value, cursor: undefined })}
          options={actions.map((action) => ({ value: action, label: action }))}
          className="w-56"
        />
        <DateInput
          aria-label="From"
          value={filters.from ?? ''}
          onChange={(event) => setFilters({ from: event.target.value, cursor: undefined })}
          className="w-40"
        />
        <DateInput
          aria-label="To"
          value={filters.to ?? ''}
          onChange={(event) => setFilters({ to: event.target.value, cursor: undefined })}
          className="w-40"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption="Activity log"
          columns={columns}
          rows={entries}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          activeFilters={activeKeys.map((key) => `${key}: ${filters[key]}`)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title="No matching activity"
              description="Nothing has been recorded for these filters."
            />
          }
        />

        <CursorPager
          prevCursor={prevCursor}
          nextCursor={nextCursor}
          onMove={(cursor) => setFilters({ cursor })}
        />
      </Card>
    </div>
  );
}

/**
 * `order.confirmed` reads better split than as one identifier, and the noun is
 * what a reader scans for. The verb carries the tone.
 */
function ActionBadge({ action }) {
  const [subject, verb] = String(action).split('.');

  const tone =
    verb === 'deleted' || verb === 'deactivated' || verb?.startsWith('login_failed')
      ? 'negative'
      : verb === 'lockout'
        ? 'warning'
        : verb === 'generated'
          ? 'accent'
          : 'neutral';

  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={tone}>{verb?.replaceAll('_', ' ') ?? action}</Badge>
      <span className="text-[--color-text-muted]">{subject}</span>
    </span>
  );
}

/**
 * The before/after diff, rendered as changed fields only.
 *
 * Cost-bearing keys are stripped SERVER-SIDE for a reader without
 * `products.view_cost`, so there is nothing to hide here — which is the
 * intended division: this component renders whatever arrived, and what arrives
 * is already what the reader is allowed to see.
 */
function Detail({ changes, context }) {
  const after = changes?.after ?? null;
  const before = changes?.before ?? null;

  const fields = after ? Object.keys(after) : [];

  if (fields.length === 0 && !context) {
    return <span className="text-[--color-text-subtle]">—</span>;
  }

  return (
    <div className="space-y-0.5 text-[0.8125rem]">
      {fields.slice(0, 4).map((field) => (
        <p key={field} className="truncate">
          <span className="text-[--color-text-muted]">{field.replaceAll('_', ' ')}: </span>
          {before?.[field] !== undefined && before?.[field] !== null && (
            <span className="text-[--color-text-subtle] line-through">{String(before[field])}</span>
          )}{' '}
          <span className="text-[--color-text]">{String(after[field])}</span>
        </p>
      ))}

      {fields.length > 4 && (
        <p className="text-[--color-text-subtle]">and {fields.length - 4} more</p>
      )}

      {context && <ContextLine context={context} />}
    </div>
  );
}

function ContextLine({ context }) {
  const parts = Object.entries(context)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${key.replaceAll('_', ' ')}: ${format(value)}`);

  if (parts.length === 0) return null;

  return <p className="truncate text-[--color-text-muted]">{parts.join(' · ')}</p>;
}

function format(value) {
  if (typeof value === 'object') return JSON.stringify(value);

  return String(value);
}

/**
 * Next and previous only.
 *
 * There is no total and no last page because the API declines to compute them,
 * and inventing a count here would mean the full table scan the cursor exists
 * to avoid.
 */
function CursorPager({ prevCursor, nextCursor, onMove }) {
  if (!prevCursor && !nextCursor) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-[--color-line] px-3 py-2">
      <p className="text-[0.8125rem] text-[--color-text-subtle]">
        Newest first. Paged by position rather than page number, so no entry can slip between pages
        as new ones arrive.
      </p>

      <div className="flex gap-2">
        <Button size="sm" disabled={!prevCursor} onClick={() => onMove(prevCursor)}>
          Newer
        </Button>
        <Button size="sm" disabled={!nextCursor} onClick={() => onMove(nextCursor)}>
          Older
        </Button>
      </div>
    </div>
  );
}
