'use client';

import { useState } from 'react';

import { useRoles, useUserActions, useUsers } from '@/features/admin/useAdmin';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { describeFilters } from '@/lib/i18n/filters';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState, ForbiddenState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { cn } from '@/lib/cn';
import { formatDateTime, formatNumber, formatRelative } from '@/lib/format';
import { initials } from '@/lib/person';

const FILTER_CONFIG = {
  defaults: { sort: 'name', page: 1, per_page: 25 },
  allowed: ['search', 'role', 'is_active', 'sort', 'page', 'per_page'],
  sortable: ['name', 'email', 'role', 'last_login_at', 'created_at'],
};

// Mirrors the server's rule (SECURITY.md §3); the server is the one that enforces it.
const MIN_PASSWORD_LENGTH = 12;

const ROLES = ['owner', 'manager', 'analyst', 'staff'];

function roleOptions(t) {
  return ROLES.map((value) => ({ value, label: t(`roles.${value}`) }));
}

/*
 * Each role's look, everywhere it appears: its card, its avatars, its badge.
 * One colour per role so a list of people reads by role at a glance.
 */
const ROLE_LOOK = {
  owner: { icon: 'shield', tile: 'bg-(--color-brand-soft) text-(--color-brand-text)' },
  manager: { icon: 'users', tile: 'bg-(--color-info-soft) text-(--color-info)' },
  analyst: { icon: 'chart', tile: 'bg-(--color-success-soft) text-(--color-success)' },
  staff: { icon: 'cart', tile: 'bg-(--color-warning-soft) text-(--color-warning)' },
};

/*
 * What the access table asks of each role: one plain-language line per
 * ability that matters to an owner deciding who gets what. WHETHER a role
 * holds it is not decided here. It is read from the server's own lists
 * (GET /roles, from AbilityRegistry), so this table cannot claim a role may
 * do what the server would refuse.
 */
const CAPABILITIES = [
  ['dashboard.view', 'sales'],
  ['orders.confirm', 'orders'],
  ['orders.refund', 'refunds'],
  ['inventory.adjust', 'stock'],
  ['expenses.create', 'expenses'],
  ['metrics.view_cost', 'cost'],
  ['analytics.view', 'analytics'],
  ['orders.export', 'export'],
  ['activity.view', 'audit'],
  ['users.change_role', 'people'],
  ['settings.update', 'settings'],
  ['integrations.manage', 'integrations'],
];

const DAY = 24 * 60 * 60 * 1000;

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const { filters, setFilters, setPage, setSort, clearFilters, activeKeys } =
    useUrlFilters(FILTER_CONFIG);

  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(null);
  // The moment the page opened, for "a month without signing in". Read once,
  // so a render stays a pure function of its inputs.
  const [now] = useState(() => Date.now());

  const { users, meta, isLoading, isError, error, refetch } = useUsers({
    page: filters.page,
    per_page: filters.per_page,
    sort: filters.sort,
    filter: { search: filters.search, role: filters.role, is_active: filters.is_active },
  });
  const { roles, summary } = useRoles();

  const actions = useUserActions();

  if (isError && error?.isForbidden) {
    return <ForbiddenState />;
  }

  const dormantDays = summary?.dormant_days ?? 30;
  const unused = (summary?.dormant ?? 0) + (summary?.never_signed_in ?? 0);

  const columns = [
    {
      key: 'name',
      header: t('users.columns.person'),
      sortable: true,
      cell: (row) => (
        <span className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
              row.is_active
                ? ROLE_LOOK[row.role]?.tile
                : 'bg-(--color-surface-selected) text-(--color-muted)',
            )}
          >
            {initials(row.name)}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-2">
              <span
                className={cn(
                  'truncate font-medium',
                  row.is_active ? 'text-(--color-text)' : 'text-(--color-muted)',
                )}
              >
                {row.name}
              </span>
              {row.id === currentUser?.id && (
                <span className="rounded-full bg-(--color-brand-soft) px-1.5 py-px text-[11px] font-medium text-(--color-brand-text)">
                  {t('users.you')}
                </span>
              )}
            </span>
            <bdi dir="ltr" className="block truncate text-xs text-(--color-muted)">
              {row.email}
            </bdi>
          </span>
        </span>
      ),
    },
    {
      key: 'role',
      header: t('filters.role'),
      sortable: true,
      width: '11rem',
      cell: (row) => (
        <Select
          aria-label={t('users.roleFor', { name: row.name })}
          value={row.role}
          onChange={(event) => actions.changeRole.mutate({ id: row.id, role: event.target.value })}
          options={roleOptions(t)}
          className="w-36"
        />
      ),
    },
    {
      key: 'is_active',
      header: t('filters.status'),
      width: '8rem',
      cell: (row) => (
        <span className="inline-flex items-center gap-2 text-sm">
          <span
            aria-hidden="true"
            className={cn(
              'size-2 rounded-full',
              row.is_active ? 'bg-(--color-success)' : 'bg-(--color-line-strong)',
            )}
          />
          <span className={row.is_active ? 'text-(--color-text)' : 'text-(--color-muted)'}>
            {row.is_active ? t('users.active') : t('users.deactivated')}
          </span>
        </span>
      ),
    },
    {
      key: 'last_login_at',
      header: t('users.columns.lastSignedIn'),
      sortable: true,
      width: '12rem',
      // Never signed in is a fact, not a blank. An Owner reviewing access
      // wants to see the account that was created and never used — and the
      // one that has not been used for a month.
      cell: (row) => <LastSignIn row={row} dormantDays={dormantDays} now={now} />,
    },
    {
      key: 'actions',
      header: '',
      width: '9rem',
      cell: (row) => (
        <Button
          size="sm"
          variant={row.is_active ? 'ghost' : 'secondary'}
          className={
            row.is_active
              ? 'text-(--color-danger) hover:bg-(--color-danger-soft) hover:text-(--color-danger)'
              : undefined
          }
          onClick={() =>
            row.is_active
              ? setConfirming(row)
              : actions.setActive.mutate({ id: row.id, active: true })
          }
        >
          {row.is_active ? t('users.deactivate') : t('users.reactivate')}
        </Button>
      ),
    },
  ];

  /*
   * Any refusal, not only the last-Owner guard.
   *
   * Showing that one and swallowing the rest left the role control displaying
   * a value the server had rejected, with nothing on screen to say so. The
   * server's own message says what to do next — promote another user first.
   */
  const actionError = [actions.changeRole.error, actions.setActive.error].find(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('nav.items.users')}
        description={t('users.description')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            <Icon name="userPlus" size={16} aria-hidden="true" />
            {t('users.add')}
          </Button>
        }
      />

      {/* Who holds each role. Each card narrows the list to it, and back. */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ROLES.map((role) => {
          const data = roles.find((item) => item.role === role);
          const selected = filters.role === role;

          return (
            <button
              key={role}
              type="button"
              aria-pressed={selected}
              onClick={() => setFilters({ role: selected ? '' : role })}
              className={cn(
                'flex items-start gap-3 rounded-(--radius-card) border bg-(--color-surface) p-4 text-start transition-colors duration-(--duration-base)',
                selected
                  ? 'border-(--color-brand) ring-1 ring-(--color-brand)'
                  : 'border-(--color-line) hover:border-(--color-line-strong)',
              )}
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-xl',
                  ROLE_LOOK[role].tile,
                )}
              >
                <Icon name={ROLE_LOOK[role].icon} size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-(--color-text)">
                    {t(`roles.${role}`)}
                  </span>
                  <span className="tabular text-xl font-semibold text-(--color-text)">
                    {data ? formatNumber(data.active) : '—'}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-5 text-(--color-text-2)">
                  {t(`users.roleSummary.${role}`)}
                </span>
                {data?.deactivated ? (
                  <span className="mt-1 block text-xs text-(--color-muted)">
                    {t('users.deactivatedCount', { count: formatNumber(data.deactivated) })}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      {/*
        Access hygiene, said once and with the remedy beside it. An account
        nobody uses is still a way in for whoever holds its password.
      */}
      {unused > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-(--radius-card) border border-(--color-warning) bg-(--color-warning-soft) p-4">
          <p className="flex items-start gap-3 text-sm text-(--color-text)">
            <Icon
              name="lock"
              size={18}
              className="mt-0.5 shrink-0 text-(--color-warning)"
              aria-hidden="true"
            />
            <span>
              {t('users.unused', {
                count: formatNumber(unused),
                days: formatNumber(dormantDays),
              })}
            </span>
          </p>
          <Button
            size="sm"
            onClick={() => setFilters({ is_active: 'true', sort: 'last_login_at', role: '' })}
          >
            {t('users.showUnused')}
          </Button>
        </div>
      ) : null}

      {actionError && (
        <p
          role="alert"
          className="rounded-(--radius-control) border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-sm text-(--color-warning)"
        >
          {actionError.message}
        </p>
      )}

      <div>
        <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
          <Input
            type="search"
            placeholder={t('users.searchPlaceholder')}
            aria-label={t('users.searchLabel')}
            defaultValue={filters.search ?? ''}
            onChange={(event) => setFilters({ search: event.target.value })}
            className="w-64"
          />
          <Select
            aria-label={t('filters.role')}
            placeholder={t('users.anyRole')}
            value={filters.role ?? ''}
            onChange={(event) => setFilters({ role: event.target.value })}
            options={roleOptions(t)}
            className="w-40"
          />
          <Select
            aria-label={t('filters.status')}
            placeholder={t('users.anyStatus')}
            value={filters.is_active ?? ''}
            onChange={(event) => setFilters({ is_active: event.target.value })}
            options={[
              { value: 'true', label: t('users.active') },
              { value: 'false', label: t('users.deactivated') },
            ]}
            className="w-40"
          />
        </FilterBar>

        <Card padded={false}>
          {/*
              `bare`: the Card around it already draws the edge. A bordered
              table inside a bordered card is a box in a box (DataTable).
            */}
          <DataTable
            bare
            caption={t('nav.items.users')}
            columns={columns}
            rows={users}
            loading={isLoading}
            error={isError ? error : null}
            onRetry={refetch}
            sort={filters.sort}
            onSortChange={setSort}
            activeFilters={describeFilters(activeKeys, filters, t)}
            onClearFilters={clearFilters}
            empty={<EmptyState title={t('users.empty')} />}
          />
          <Pagination
            meta={meta}
            onPageChange={setPage}
            onPerPageChange={(perPage) => setFilters({ per_page: perPage })}
          />
        </Card>
      </div>

      {roles.length ? <AccessTable roles={roles} /> : null}

      <CreateUserDialog
        open={creating}
        onClose={() => setCreating(false)}
        mutation={actions.create}
      />

      <ConfirmDialog
        open={confirming !== null}
        onClose={() => setConfirming(null)}
        title={t('users.confirm.title')}
        /*
          Stated in business terms, as ConfirmDialog requires. Deactivation is
          not "sign them out": it takes effect on their very next request,
          mid-session, and it is not a deletion — the audit trail stays.
        */
        consequence={
          confirming?.name
            ? t('users.confirm.consequence', { name: confirming.name })
            : t('users.confirm.consequenceUnnamed')
        }
        confirmLabel={t('users.deactivate')}
        onConfirm={() => {
          actions.setActive.mutate({ id: confirming.id, active: false });
          setConfirming(null);
        }}
      />
    </div>
  );
}

/** When they last signed in: relative, with the exact time on hover; a month without, said. */
function LastSignIn({ row, dormantDays, now }) {
  const { t } = useI18n();

  if (!row.last_login_at) {
    return (
      <span
        className={cn('text-sm', row.is_active ? 'text-(--color-warning)' : 'text-(--color-muted)')}
      >
        {t('users.never')}
      </span>
    );
  }

  const dormant = row.is_active && now - new Date(row.last_login_at).getTime() > dormantDays * DAY;

  return (
    <span title={formatDateTime(row.last_login_at)} className="block text-sm">
      <span className={dormant ? 'text-(--color-warning)' : 'text-(--color-text)'}>
        {formatRelative(row.last_login_at)}
      </span>
      <span className="block text-xs text-(--color-muted)">
        {formatDateTime(row.last_login_at)}
      </span>
    </span>
  );
}

/**
 * What each role may do, as the server grants it. Folded by default: it is
 * the answer to "should this person be a manager or an analyst?", asked
 * now and then, not on every visit.
 */
function AccessTable({ roles }) {
  const { t } = useI18n();

  return (
    <details className="group rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card)">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-(--color-brand-soft) text-(--color-brand-text)">
            <Icon name="lock" size={16} aria-hidden="true" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-(--color-text)">
              {t('users.access.title')}
            </span>
            <span className="block text-xs text-(--color-text-2)">
              {t('users.access.description')}
            </span>
          </span>
        </span>
        <Icon
          name="expand"
          size={16}
          className="text-(--color-muted) transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="overflow-x-auto border-t border-(--color-line)">
        <table className="w-full min-w-[36rem] text-sm">
          <caption className="sr-only">{t('users.access.title')}</caption>
          <thead>
            <tr className="text-xs text-(--color-text-2)">
              <th scope="col" className="px-4 py-2.5 text-start font-medium">
                {t('users.access.can')}
              </th>
              {roles.map((role) => (
                <th
                  key={role.role}
                  scope="col"
                  className="px-3 py-2.5 text-center font-semibold text-(--color-text)"
                >
                  {t(`roles.${role.role}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map(([ability, key]) => (
              <tr key={ability} className="border-t border-(--border-subtle)">
                <th scope="row" className="px-4 py-2.5 text-start font-normal text-(--color-text)">
                  {t(`users.access.items.${key}`)}
                </th>
                {roles.map((role) => {
                  const granted = role.abilities.includes(ability);

                  return (
                    <td key={role.role} className="px-3 py-2.5 text-center">
                      {granted ? (
                        <span className="inline-flex size-6 items-center justify-center rounded-full bg-(--color-success-soft) text-(--color-success)">
                          <Icon name="check" size={14} aria-hidden="true" />
                        </span>
                      ) : (
                        <span aria-hidden="true" className="text-(--color-line-strong)">
                          —
                        </span>
                      )}
                      <span className="sr-only">
                        {granted ? t('users.access.yes') : t('users.access.no')}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

function CreateUserDialog({ open, onClose, mutation }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    password_confirmation: '',
    role: 'staff',
  });

  const fieldErrors = mutation.error?.fieldErrors ?? {};

  function submit(event) {
    event.preventDefault();

    mutation.mutate(form, {
      onSuccess: () => {
        setForm({ name: '', email: '', password: '', password_confirmation: '', role: 'staff' });
        onClose();
      },
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('users.add')}>
      <form onSubmit={submit} className="space-y-3">
        <Field label={t('users.columns.name')} required error={fieldErrors.name}>
          {(props) => (
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              {...props}
            />
          )}
        </Field>

        <Field label={t('customers.columns.email')} required error={fieldErrors.email}>
          {(props) => (
            <Input
              type="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
              {...props}
            />
          )}
        </Field>

        <Field
          label={t('auth.password')}
          required
          error={fieldErrors.password}
          // Length and breach-checking outperform composition rules, which
          // mostly produce `Password1!` (SECURITY.md §3).
          hint={t('users.passwordHint', { count: MIN_PASSWORD_LENGTH })}
        >
          {(props) => (
            <Input
              type="password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
              {...props}
            />
          )}
        </Field>

        <Field label={t('users.confirmPassword')} required>
          {(props) => (
            <Input
              type="password"
              value={form.password_confirmation}
              onChange={(event) => setForm({ ...form, password_confirmation: event.target.value })}
              required
              {...props}
            />
          )}
        </Field>

        <Field label={t('filters.role')} required error={fieldErrors.role}>
          {(props) => (
            <Select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              options={roleOptions(t)}
              {...props}
            />
          )}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            {t('users.create')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
