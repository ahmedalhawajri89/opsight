'use client';

import { useActivity, useActivityActions } from '@/features/admin/useAdmin';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { describeFilters } from '@/lib/i18n/filters';
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
  const { t } = useI18n();
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
      header: t('activity.columns.when'),
      numeric: true,
      width: '12rem',
      cell: (row) => formatDateTime(row.occurred_at),
    },
    {
      key: 'action',
      header: t('activity.columns.action'),
      width: '13rem',
      cell: (row) => <ActionBadge action={row.action} />,
    },
    {
      key: 'actor',
      header: t('activity.columns.who'),
      width: '14rem',
      // Null for a failed sign-in: whoever submitted it did not prove they
      // were the account holder, so the row names no actor.
      cell: (row) =>
        row.actor ? (
          <span>
            {row.actor.name}
            <span className="ms-1.5 text-(--color-muted)">{row.actor.role_label}</span>
          </span>
        ) : (
          <span className="text-(--color-muted)">{t('activity.notSignedIn')}</span>
        ),
    },
    {
      key: 'subject',
      header: t('activity.columns.subject'),
      width: '10rem',
      cell: (row) =>
        row.subject_type
          ? `${translateOr(t, `activity.subjectTypes.${row.subject_type}`, row.subject_type)} ${row.subject_id ?? ''}`.trim()
          : '—',
    },
    {
      key: 'changes',
      header: t('activity.columns.detail'),
      cell: (row) => <Detail changes={row.changes} context={row.context} />,
    },
  ];

  return (
    <div>
      <PageHeader
        title={t('nav.items.activity')}
        description={t('activity.description')}
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
          aria-label={t('filters.action')}
          placeholder={t('activity.anyAction')}
          value={filters.action ?? ''}
          onChange={(event) => setFilters({ action: event.target.value, cursor: undefined })}
          options={actions.map((action) => ({ value: action, label: describeAction(t, action) }))}
          className="w-56"
        />
        <DateInput
          aria-label={t('filters.from')}
          value={filters.from ?? ''}
          onChange={(event) => setFilters({ from: event.target.value, cursor: undefined })}
          className="w-40"
        />
        <DateInput
          aria-label={t('filters.to')}
          value={filters.to ?? ''}
          onChange={(event) => setFilters({ to: event.target.value, cursor: undefined })}
          className="w-40"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption={t('nav.items.activity')}
          columns={columns}
          rows={entries}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          activeFilters={describeFilters(activeKeys, filters, t)}
          onClearFilters={clearFilters}
          empty={
            <EmptyState
              title={t('activity.empty.title')}
              description={t('activity.empty.description')}
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
 * A dictionary lookup that falls back to a readable form of the raw value.
 *
 * The audit log's vocabulary is open-ended: a later feature can start writing
 * an action this screen has no translation for yet. That must still render as
 * something a person can read rather than as a dictionary key.
 */
function translateOr(t, key, fallback) {
  return t.has(key) ? t(key) : String(fallback).replaceAll('_', ' ');
}

function describeAction(t, action) {
  const [subject, verb] = String(action).split('.');

  return `${translateOr(t, `activity.subjects.${subject}`, subject)} · ${translateOr(t, `activity.verbs.${verb}`, verb)}`;
}

/**
 * `order.confirmed` reads better split than as one identifier, and the noun is
 * what a reader scans for. The verb carries the tone.
 */
function ActionBadge({ action }) {
  const { t } = useI18n();
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
      <Badge tone={tone}>{verb ? translateOr(t, `activity.verbs.${verb}`, verb) : action}</Badge>
      <span className="text-(--color-text-2)">
        {translateOr(t, `activity.subjects.${subject}`, subject)}
      </span>
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
  const { t } = useI18n();
  const after = changes?.after ?? null;
  const before = changes?.before ?? null;

  const fields = after ? Object.keys(after) : [];

  if (fields.length === 0 && !context) {
    return <span className="text-(--color-muted)">—</span>;
  }

  return (
    <div className="space-y-0.5 text-sm">
      {fields.slice(0, 4).map((field) => (
        <p key={field} className="truncate">
          <span className="text-(--color-text-2)">
            {translateOr(t, `activity.fields.${field}`, field)}:{' '}
          </span>
          {before?.[field] !== undefined && before?.[field] !== null && (
            <span className="text-(--color-muted) line-through">{String(before[field])}</span>
          )}{' '}
          <span className="text-(--color-text)">{String(after[field])}</span>
        </p>
      ))}

      {fields.length > 4 && (
        <p className="text-(--color-muted)">
          {t('activity.moreFields', { count: fields.length - 4 })}
        </p>
      )}

      {context && <ContextLine context={context} />}
    </div>
  );
}

/*
 * Recorded values are shown as recorded — digits included. This is an audit
 * trail: its job is to show exactly what was written, and reformatting a value
 * would put a presentation layer between the reader and the evidence.
 */
function ContextLine({ context }) {
  const { t } = useI18n();
  const parts = Object.entries(context)
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${translateOr(t, `activity.fields.${key}`, key)}: ${format(value)}`);

  if (parts.length === 0) return null;

  return <p className="truncate text-(--color-text-2)">{parts.join(' · ')}</p>;
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
  const { t } = useI18n();

  if (!prevCursor && !nextCursor) return null;

  return (
    <div className="flex items-center justify-between gap-3 border-t border-(--color-line) px-3 py-2">
      <p className="text-sm text-(--color-muted)">{t('activity.pagerNote')}</p>

      <div className="flex gap-2">
        <Button size="sm" disabled={!prevCursor} onClick={() => onMove(prevCursor)}>
          {t('activity.newer')}
        </Button>
        <Button size="sm" disabled={!nextCursor} onClick={() => onMove(nextCursor)}>
          {t('activity.older')}
        </Button>
      </div>
    </div>
  );
}
