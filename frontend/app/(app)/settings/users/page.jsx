'use client';

import { useState } from 'react';

import { useUserActions, useUsers } from '@/features/admin/useAdmin';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { describeFilters } from '@/lib/i18n/filters';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field, Input, Select } from '@/components/ui/Field';
import { DataTable } from '@/components/data/DataTable';
import { Pagination } from '@/components/data/Pagination';
import { EmptyState, ForbiddenState } from '@/components/data/States';
import { Card, FilterBar, PageHeader } from '@/components/layout/PageHeader';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { formatDateTime } from '@/lib/format';

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

export default function UsersPage() {
  const { user: currentUser } = useAuth();
  const { t } = useI18n();
  const { filters, setFilters, setPage, setSort, clearFilters, activeKeys } =
    useUrlFilters(FILTER_CONFIG);

  const [creating, setCreating] = useState(false);
  const [confirming, setConfirming] = useState(null);

  const { users, meta, isLoading, isError, error, refetch } = useUsers({
    page: filters.page,
    per_page: filters.per_page,
    sort: filters.sort,
    filter: { search: filters.search, role: filters.role, is_active: filters.is_active },
  });

  const actions = useUserActions();

  if (isError && error?.isForbidden) {
    return <ForbiddenState />;
  }

  const columns = [
    {
      key: 'name',
      header: t('users.columns.name'),
      sortable: true,
      cell: (row) => (
        <span>
          {row.name}
          {row.id === currentUser?.id && (
            <span className="ms-2 text-(--color-muted)">{t('users.you')}</span>
          )}
        </span>
      ),
    },
    {
      key: 'email',
      header: t('customers.columns.email'),
      sortable: true,
      width: '16rem',
      cell: (row) => <bdi dir="ltr">{row.email}</bdi>,
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
          className="w-32"
        />
      ),
    },
    {
      key: 'is_active',
      header: t('filters.status'),
      width: '8rem',
      cell: (row) =>
        row.is_active ? (
          <Badge tone="positive">{t('users.active')}</Badge>
        ) : (
          <Badge tone="neutral">{t('users.deactivated')}</Badge>
        ),
    },
    {
      key: 'last_login_at',
      header: t('users.columns.lastSignedIn'),
      sortable: true,
      numeric: true,
      width: '12rem',
      // Never signed in is a fact, not a blank. An Owner reviewing access
      // wants to see the account that was created and never used.
      cell: (row) =>
        row.last_login_at ? (
          formatDateTime(row.last_login_at)
        ) : (
          <span className="text-(--color-muted)">{t('users.never')}</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      width: '9rem',
      cell: (row) => (
        <Button
          size="sm"
          variant={row.is_active ? 'danger' : 'secondary'}
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
   * A refusal from the last-Owner guard is a 409, and it can arrive from
   * either the role control or the deactivate button. Surfacing the server's
   * own message is better than a generic failure: it says what to do next —
   * promote another user first.
   */
  /*
   * Any refusal, not only the last-Owner guard.
   *
   * Showing that one and swallowing the rest left the role control displaying
   * a value the server had rejected, with nothing on screen to say so.
   */
  const actionError = [actions.changeRole.error, actions.setActive.error].find(Boolean);

  return (
    <div>
      <PageHeader
        title={t('nav.items.users')}
        description={t('users.description')}
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            {t('users.add')}
          </Button>
        }
      />

      {actionError && (
        <p
          role="alert"
          className="mb-3 rounded-(--radius-control) border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-sm text-(--color-warning)"
        >
          {actionError.message}
        </p>
      )}

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
      </FilterBar>

      <Card padded={false}>
        <DataTable
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
