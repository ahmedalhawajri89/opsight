'use client';

import { useState } from 'react';

import { useUserActions, useUsers } from '@/features/admin/useAdmin';
import { useAuth } from '@/features/auth/AuthProvider';
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

const ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'analyst', label: 'Analyst' },
  { value: 'staff', label: 'Staff' },
];

export default function UsersPage() {
  const { user: currentUser } = useAuth();
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
      header: 'Name',
      sortable: true,
      cell: (row) => (
        <span>
          {row.name}
          {row.id === currentUser?.id && (
            <span className="ms-2 text-[--color-text-subtle]">(you)</span>
          )}
        </span>
      ),
    },
    { key: 'email', header: 'Email', sortable: true, width: '16rem' },
    {
      key: 'role',
      header: 'Role',
      sortable: true,
      width: '11rem',
      cell: (row) => (
        <Select
          aria-label={`Role for ${row.name}`}
          value={row.role}
          onChange={(event) => actions.changeRole.mutate({ id: row.id, role: event.target.value })}
          options={ROLES}
          className="w-32"
        />
      ),
    },
    {
      key: 'is_active',
      header: 'Status',
      width: '8rem',
      cell: (row) =>
        row.is_active ? (
          <Badge tone="positive">Active</Badge>
        ) : (
          <Badge tone="neutral">Deactivated</Badge>
        ),
    },
    {
      key: 'last_login_at',
      header: 'Last signed in',
      sortable: true,
      numeric: true,
      width: '12rem',
      // Never signed in is a fact, not a blank. An Owner reviewing access
      // wants to see the account that was created and never used.
      cell: (row) =>
        row.last_login_at ? (
          formatDateTime(row.last_login_at)
        ) : (
          <span className="text-[--color-text-subtle]">Never</span>
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
          {row.is_active ? 'Deactivate' : 'Reactivate'}
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
  const guardError = [actions.changeRole.error, actions.setActive.error].find(
    (candidate) => candidate?.code === 'users.last_owner',
  );

  return (
    <div>
      <PageHeader
        title="Users"
        description="Accounts are deactivated, never deleted. A deleted user takes their audit trail with them, and every past action becomes unattributable."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />

      {guardError && (
        <p
          role="alert"
          className="mb-3 rounded-[--radius-sm] border border-[--color-warning] bg-[--color-warning-subtle] px-3 py-2 text-[0.8125rem] text-[--color-warning]"
        >
          {guardError.message}
        </p>
      )}

      <FilterBar activeCount={activeKeys.length} onClear={clearFilters}>
        <Input
          type="search"
          placeholder="Search name or email…"
          aria-label="Search users"
          defaultValue={filters.search ?? ''}
          onChange={(event) => setFilters({ search: event.target.value })}
          className="w-64"
        />
        <Select
          aria-label="Role"
          placeholder="Any role"
          value={filters.role ?? ''}
          onChange={(event) => setFilters({ role: event.target.value })}
          options={ROLES}
          className="w-40"
        />
      </FilterBar>

      <Card padded={false}>
        <DataTable
          caption="Users"
          columns={columns}
          rows={users}
          loading={isLoading}
          error={isError ? error : null}
          onRetry={refetch}
          sort={filters.sort}
          onSortChange={setSort}
          activeFilters={activeKeys.map((key) => `${key}: ${filters[key]}`)}
          onClearFilters={clearFilters}
          empty={<EmptyState title="No matching users" />}
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
        title="Deactivate this account?"
        /*
          Stated in business terms, as ConfirmDialog requires. Deactivation is
          not "sign them out": it takes effect on their very next request,
          mid-session, and it is not a deletion — the audit trail stays.
        */
        consequence={`${confirming?.name ?? 'This user'} will lose access on their next request, even if they are signed in right now, and will not be able to sign in again. Everything they have already done stays on record.`}
        confirmLabel="Deactivate"
        onConfirm={() => {
          actions.setActive.mutate({ id: confirming.id, active: false });
          setConfirming(null);
        }}
      />
    </div>
  );
}

function CreateUserDialog({ open, onClose, mutation }) {
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
    <Dialog open={open} onClose={onClose} title="Add user">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name" required error={fieldErrors.name}>
          {(props) => (
            <Input
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              {...props}
            />
          )}
        </Field>

        <Field label="Email" required error={fieldErrors.email}>
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
          label="Password"
          required
          error={fieldErrors.password}
          // Length and breach-checking outperform composition rules, which
          // mostly produce `Password1!` (SECURITY.md §3).
          hint="At least 12 characters. The new user should change it after signing in."
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

        <Field label="Confirm password" required>
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

        <Field label="Role" required error={fieldErrors.role}>
          {(props) => (
            <Select
              value={form.role}
              onChange={(event) => setForm({ ...form, role: event.target.value })}
              options={ROLES}
              {...props}
            />
          )}
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={mutation.isPending}>
            Create user
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
