'use client';

import { useState } from 'react';

import { useActivity, useActivityActions, useActivitySummary } from '@/features/admin/useAdmin';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DateInput, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Skeleton } from '@/components/ui/Skeleton';
import { Sparkline } from '@/components/charts/Sparkline';
import { ExportButton } from '@/components/data/ExportButton';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { cn } from '@/lib/cn';
import { formatDate, formatDateTime, formatNumber, getFormatLocale, toIsoDate } from '@/lib/format';
import { initials } from '@/lib/person';
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
  allowed: ['action', 'category', 'user_id', 'subject_type', 'from', 'to', 'cursor', 'per_page'],
  sortable: [],
};

/*
 * The log's areas. WHICH actions belong to each is the server's list
 * (ActivityController::CATEGORIES), which the filter uses; this mirror only
 * picks an icon and a colour for an entry, and an action it does not know
 * is drawn as "system", never hidden.
 */
const CATEGORIES = [
  {
    key: 'security',
    icon: 'lock',
    prefixes: ['auth.'],
    tone: 'bg-(--color-danger-soft) text-(--color-danger)',
  },
  {
    key: 'sales',
    icon: 'cart',
    prefixes: ['order.', 'orderitem.', 'customer.'],
    tone: 'bg-(--color-brand-soft) text-(--color-brand-text)',
  },
  {
    key: 'catalogue',
    icon: 'box',
    prefixes: ['product.', 'category.', 'inventory.', 'import.'],
    tone: 'bg-(--color-warning-soft) text-(--color-warning)',
  },
  {
    key: 'money',
    icon: 'coins',
    prefixes: ['expense.', 'expensecategory.', 'forecast.', 'report.'],
    tone: 'bg-(--color-success-soft) text-(--color-success)',
  },
  {
    key: 'people',
    icon: 'users',
    prefixes: ['user.'],
    tone: 'bg-(--color-info-soft) text-(--color-info)',
  },
  {
    key: 'system',
    icon: 'database',
    prefixes: [],
    tone: 'bg-(--color-surface-selected) text-(--color-text-2)',
  },
];

function categoryOf(action) {
  return (
    CATEGORIES.find((category) =>
      category.prefixes.some((prefix) => String(action).startsWith(prefix)),
    ) ?? CATEGORIES[5]
  );
}

export default function ActivityPage() {
  const { can } = useAuth();
  const { t } = useI18n();
  const { filters, setFilters, clearFilters, activeKeys } = useUrlFilters(FILTER_CONFIG);
  // "Today" and "yesterday" as of when the page opened, read once so a
  // render stays a pure function of its inputs.
  const [now] = useState(() => Date.now());

  const listFilter = {
    action: filters.action,
    category: filters.category,
    subject_type: filters.subject_type,
    from: filters.from,
    to: filters.to,
  };

  const { entries, nextCursor, prevCursor, isLoading, isError, error, refetch } = useActivity({
    per_page: filters.per_page,
    cursor: filters.cursor,
    filter: listFilter,
  });

  const { actions } = useActivityActions();
  const { summary } = useActivitySummary();

  if (isError && error?.isForbidden) {
    return <ForbiddenState />;
  }

  const pick = (category) =>
    setFilters({ category: filters.category === category ? '' : category, cursor: undefined });

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav.items.activity')}
        description={t('activity.description')}
        actions={
          can('activity.export') ? (
            <ExportButton
              onExport={exportActivity}
              filters={{ per_page: filters.per_page, filter: listFilter }}
            />
          ) : null
        }
      />

      <Pulse summary={summary} onSecurity={() => pick('security')} />

      {/* The areas of the business, one tap each. */}
      <div
        role="group"
        aria-label={t('activity.categories.label')}
        className="flex flex-wrap gap-2"
      >
        {[{ key: '' }, ...CATEGORIES].map(({ key, icon }) => {
          const selected = (filters.category ?? '') === key;

          return (
            <button
              key={key || 'all'}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilters({ category: key, cursor: undefined })}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-(--radius-pill) border px-3 text-sm font-medium transition-colors duration-(--duration-base)',
                selected
                  ? 'border-(--color-brand) bg-(--color-brand) text-(--color-text-inverse)'
                  : 'border-(--color-line) bg-(--color-surface) text-(--color-text-2) hover:border-(--color-line-strong) hover:text-(--color-text)',
              )}
            >
              {icon ? <Icon name={icon} size={14} aria-hidden="true" /> : null}
              {t(`activity.categories.${key || 'all'}`)}
            </button>
          );
        })}
      </div>

      <div>
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
          {isError ? (
            <ErrorState error={error} onRetry={refetch} />
          ) : isLoading ? (
            <div className="space-y-4 p-5">
              {[0, 1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-12 w-full" />
              ))}
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              title={t('activity.empty.title')}
              description={t('activity.empty.description')}
              action={
                activeKeys.length ? (
                  <Button size="sm" onClick={clearFilters}>
                    {t('states.noResults.clear')}
                  </Button>
                ) : null
              }
            />
          ) : (
            <Timeline entries={entries} now={now} />
          )}

          <CursorPager
            prevCursor={prevCursor}
            nextCursor={nextCursor}
            onMove={(cursor) => setFilters({ cursor })}
          />
        </Card>
      </div>
    </div>
  );
}

/**
 * The log at a glance: today with its last fortnight, the people at work,
 * the week, and the failed sign-ins — the one figure here that can mean
 * someone is trying a door.
 */
function Pulse({ summary, onSecurity }) {
  const { t } = useI18n();
  const failed = summary?.failed_sign_ins_week ?? 0;

  const tiles = [
    {
      key: 'today',
      icon: 'clock',
      value: summary?.today,
      spark: summary?.daily?.map((day) => day.count),
    },
    { key: 'people', icon: 'users', value: summary?.people_today },
    { key: 'week', icon: 'calendar', value: summary?.week },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {tiles.map((tile) => (
        <div
          key={tile.key}
          className="flex items-center gap-3 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-4"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--color-brand-soft) text-(--color-brand-text)">
            <Icon name={tile.icon} size={18} aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-xs text-(--color-text-2)">
              {t(`activity.pulse.${tile.key}`)}
            </span>
            <span className="tabular block text-xl font-semibold text-(--color-text)">
              {summary ? formatNumber(tile.value) : '—'}
            </span>
          </span>
          {tile.spark ? (
            <span className="w-24 shrink-0" dir="ltr" aria-hidden="true">
              <Sparkline values={tile.spark} height={32} />
            </span>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        onClick={onSecurity}
        className={cn(
          'flex items-center gap-3 rounded-(--radius-card) border p-4 text-start transition-colors duration-(--duration-base)',
          failed > 0
            ? 'border-(--color-danger) bg-(--color-danger-soft) hover:bg-(--color-surface)'
            : 'border-(--color-line) bg-(--color-surface) hover:border-(--color-line-strong)',
        )}
      >
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-xl',
            failed > 0
              ? 'bg-(--color-danger) text-(--color-text-inverse)'
              : 'bg-(--color-success-soft) text-(--color-success)',
          )}
        >
          <Icon name={failed > 0 ? 'alert' : 'shield'} size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block text-xs text-(--color-text-2)">{t('activity.pulse.failed')}</span>
          <span className="tabular block text-xl font-semibold text-(--color-text)">
            {summary ? formatNumber(failed) : '—'}
          </span>
          <span className="block text-xs text-(--color-muted)">
            {failed > 0 ? t('activity.pulse.failedSome') : t('activity.pulse.failedNone')}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * The entries, grouped by day, newest first. A day is a heading; an entry
 * is who, what, to which record, and what changed.
 */
function Timeline({ entries, now }) {
  const { t } = useI18n();

  const today = toIsoDate(now);
  const yesterday = toIsoDate(now - 24 * 60 * 60 * 1000);
  const days = [];

  for (const entry of entries) {
    const day = toIsoDate(entry.occurred_at);
    let group = days[days.length - 1];

    if (group?.day !== day) {
      group = { day, entries: [] };
      days.push(group);
    }

    /*
     * The same person doing the same thing again, with nothing changed,
     * folds into the entry above it: "signed in ×4" says what eight
     * identical lines said, in one. Anything carrying a change, a context
     * or a different actor stays its own entry — those are the evidence.
     */
    const previous = group.entries[group.entries.length - 1];

    if (previous && isRepeat(previous, entry)) {
      previous.repeats += 1;
      previous.earliest = entry.occurred_at;
    } else {
      group.entries.push({ ...entry, repeats: 1, earliest: entry.occurred_at });
    }
  }

  const label = (day) =>
    day === today
      ? t('activity.today')
      : day === yesterday
        ? t('activity.yesterday')
        : formatDate(day);

  return (
    <ol aria-label={t('nav.items.activity')} className="divide-y divide-(--color-line)">
      {days.map(({ day, entries: items }) => (
        <li key={day}>
          <h2 className="sticky top-[62px] z-10 flex items-center justify-between gap-3 bg-(--color-surface)/95 px-5 py-2.5 text-xs font-semibold text-(--color-text-2) backdrop-blur-sm">
            <span>{label(day)}</span>
            <span className="tabular font-normal text-(--color-muted)">
              {t('activity.entries', { count: formatNumber(items.length) })}
            </span>
          </h2>
          <ol className="relative px-5 pb-3 before:absolute before:inset-y-0 before:start-[3.85rem] before:w-px before:bg-(--border-subtle) sm:before:start-[5.35rem]">
            {items.map((entry) => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function isRepeat(previous, entry) {
  return (
    previous.action === entry.action &&
    (previous.actor?.id ?? null) === (entry.actor?.id ?? null) &&
    !previous.changes &&
    !entry.changes &&
    JSON.stringify(previous.context ?? null) === JSON.stringify(entry.context ?? null)
  );
}

function Entry({ entry }) {
  const { t } = useI18n();
  const category = categoryOf(entry.action);
  const time = new Intl.DateTimeFormat(getFormatLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(entry.occurred_at));

  return (
    <li className="relative flex gap-3 py-2.5 sm:gap-4">
      <time
        dateTime={entry.occurred_at}
        title={formatDateTime(entry.occurred_at)}
        className="tabular w-9 shrink-0 pt-1.5 text-xs text-(--color-muted) sm:w-14"
      >
        {time}
      </time>
      <span
        className={cn(
          'relative z-[1] flex size-8 shrink-0 items-center justify-center rounded-full ring-4 ring-(--color-surface)',
          category.tone,
        )}
      >
        <Icon name={category.icon} size={14} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {/* Null for a failed sign-in: whoever submitted it did not prove they were the account holder. */}
          {entry.actor ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="flex size-5 items-center justify-center rounded-full bg-(--color-surface-selected) text-[9px] font-semibold text-(--color-text-2)"
              >
                {initials(entry.actor.name)}
              </span>
              <span className="font-semibold text-(--color-text)">{entry.actor.name}</span>
              <span className="text-xs text-(--color-muted)">{entry.actor.role_label}</span>
            </span>
          ) : (
            <span className="text-(--color-muted)">{t('activity.notSignedIn')}</span>
          )}
          <ActionBadge action={entry.action} />
          {entry.repeats > 1 ? (
            <span
              title={t('activity.repeatedSince', { time: formatDateTime(entry.earliest) })}
              className="tabular rounded-full bg-(--color-surface-selected) px-1.5 py-px text-xs font-medium text-(--color-text-2)"
            >
              {t('activity.repeated', { count: formatNumber(entry.repeats) })}
            </span>
          ) : null}
          {entry.subject_type ? (
            <span className="text-xs text-(--color-muted)">
              {`${translateOr(t, `activity.subjectTypes.${entry.subject_type}`, entry.subject_type)} ${entry.subject_id ? `#${entry.subject_id}` : ''}`.trim()}
            </span>
          ) : null}
        </p>
        <Detail changes={entry.changes} context={entry.context} />
        {entry.ip_address && !entry.actor && category.key === 'security' ? (
          <p className="mt-0.5 text-xs text-(--color-muted)">
            <bdi dir="ltr">{entry.ip_address}</bdi>
          </p>
        ) : null}
      </div>
    </li>
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
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <Badge tone={tone}>{verb ? translateOr(t, `activity.verbs.${verb}`, verb) : action}</Badge>
      <span className="text-(--color-text-2)">
        {translateOr(t, `activity.subjects.${subject}`, subject)}
      </span>
    </span>
  );
}

/**
 * The before/after diff, as changed fields only: each a chip, the old value
 * struck through beside the new.
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

  if (fields.length === 0 && !context) return null;

  return (
    <div className="mt-1.5 space-y-1">
      {fields.length ? (
        <ul className="flex flex-wrap gap-1.5">
          {fields.slice(0, 4).map((field) => (
            <li
              key={field}
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-(--border-subtle) bg-(--color-ground) px-2 py-0.5 text-xs"
            >
              <span className="text-(--color-text-2)">
                {translateOr(t, `activity.fields.${field}`, field)}
              </span>
              {before?.[field] !== undefined && before?.[field] !== null && (
                <>
                  <span className="truncate text-(--color-muted) line-through">
                    {String(before[field])}
                  </span>
                  <span aria-hidden="true" className="text-(--color-muted) rtl:rotate-180">
                    →
                  </span>
                </>
              )}
              <span className="truncate font-medium text-(--color-text)">
                {String(after[field])}
              </span>
            </li>
          ))}
          {fields.length > 4 && (
            <li className="px-1 text-xs text-(--color-muted)">
              {t('activity.moreFields', { count: fields.length - 4 })}
            </li>
          )}
        </ul>
      ) : null}

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

  return <p className="truncate text-xs text-(--color-text-2)">{parts.join(' · ')}</p>;
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
    <div className="flex items-center justify-between gap-3 border-t border-(--color-line) px-5 py-3">
      <p className="text-xs text-(--color-muted)">{t('activity.pagerNote')}</p>

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
