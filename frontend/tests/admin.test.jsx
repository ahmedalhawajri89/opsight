import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import UsersPage from '@/app/(app)/settings/users/page';
import ActivityPage from '@/app/(app)/activity/page';
import * as admin from '@/services/admin';

/*
 * Users and roles, and the activity log: who holds which role and what the
 * server lets it do; what happened, grouped by day, in plain words.
 */

const push = vi.fn();
let search = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push }),
  usePathname: () => '/x',
  useSearchParams: () => search,
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, name: 'Ahmed Al Hawajri' }, can: () => true }),
}));

vi.mock('@/services/admin', () => ({
  listUsers: vi.fn(),
  listRoles: vi.fn(),
  listActivity: vi.fn(),
  listActivityActions: vi.fn(),
  activitySummary: vi.fn(),
  exportActivity: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  changeUserRole: vi.fn(),
  setUserActive: vi.fn(),
}));

const ROLES = {
  data: {
    roles: [
      {
        role: 'owner',
        abilities: ['dashboard.view', 'metrics.view_cost', 'settings.update'],
        active: 1,
        deactivated: 0,
      },
      {
        role: 'manager',
        abilities: ['dashboard.view', 'metrics.view_cost'],
        active: 2,
        deactivated: 0,
      },
      {
        role: 'analyst',
        abilities: ['dashboard.view', 'metrics.view_cost'],
        active: 1,
        deactivated: 0,
      },
      { role: 'staff', abilities: ['dashboard.view'], active: 3, deactivated: 1 },
    ],
    summary: { active: 7, deactivated: 1, never_signed_in: 1, dormant: 1, dormant_days: 30 },
  },
};

const USERS = {
  data: [
    {
      id: 1,
      name: 'Ahmed Al Hawajri',
      email: 'owner@opsight.test',
      role: 'owner',
      is_active: true,
      last_login_at: new Date().toISOString(),
    },
    {
      id: 2,
      name: 'Sara Staff',
      email: 'staff@opsight.test',
      role: 'staff',
      is_active: true,
      last_login_at: null,
    },
  ],
  meta: { current_page: 1, last_page: 1, per_page: 25, total: 2 },
};

function renderPage(Page) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  search = new URLSearchParams();
  push.mockReset();
  window.matchMedia ??= () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  vi.mocked(admin.listUsers).mockReset().mockResolvedValue(USERS);
  vi.mocked(admin.listRoles).mockReset().mockResolvedValue(ROLES);
  vi.mocked(admin.listActivityActions)
    .mockReset()
    .mockResolvedValue({ data: ['auth.login', 'order.confirmed'] });
  vi.mocked(admin.activitySummary)
    .mockReset()
    .mockResolvedValue({
      data: {
        today: 4,
        week: 20,
        people_today: 2,
        failed_sign_ins_week: 3,
        daily: Array.from({ length: 14 }, () => ({ count: 1 })),
      },
    });
  vi.mocked(admin.listActivity)
    .mockReset()
    .mockResolvedValue({
      data: [
        {
          id: 2,
          action: 'user.role_changed',
          subject_type: 'User',
          subject_id: 7,
          changes: { before: { role: 'staff' }, after: { role: 'manager' } },
          context: null,
          occurred_at: new Date().toISOString(),
          actor: { id: 1, name: 'Ahmed Al Hawajri', role_label: 'Owner' },
        },
        {
          id: 1,
          action: 'auth.login_failed',
          subject_type: null,
          subject_id: null,
          changes: null,
          context: null,
          ip_address: '10.0.0.9',
          occurred_at: '2026-01-05T09:00:00Z',
          actor: null,
        },
      ],
      meta: { next_cursor: 'abc', prev_cursor: null },
    });
});

describe('users and roles', () => {
  it('counts who holds each role, and narrows the list from its card', async () => {
    const user = userEvent.setup();
    renderPage(UsersPage);

    const staff = await screen.findByRole('button', { name: /Staff.*Takes orders/ });
    expect(await within(staff).findByText('3')).toBeInTheDocument();
    expect(within(staff).getByText('1 deactivated')).toBeInTheDocument();

    await user.click(staff);
    expect(push.mock.calls.at(-1)[0]).toContain('role=staff');
  });

  it('says how many accounts nobody is using, with the way to find them', async () => {
    renderPage(UsersPage);

    expect(
      await screen.findByText(/2 active accounts have not signed in for 30 days/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show them' })).toBeInTheDocument();
  });

  it('draws the access table from the server’s own lists', async () => {
    renderPage(UsersPage);

    const table = await screen.findByRole('table', { name: 'What each role can do' });
    const cost = within(table).getByRole('row', { name: /See costs, profit and margins/ });

    // Owner, manager and analyst may see cost; staff may not.
    expect(within(cost).getAllByText('Yes')).toHaveLength(3);
    expect(within(cost).getAllByText('No')).toHaveLength(1);
  });

  it('shows each person with their email, and an account never used', async () => {
    renderPage(UsersPage);

    expect(await screen.findByRole('cell', { name: /staff@opsight\.test/ })).toBeInTheDocument();
    expect(screen.getAllByText('Never').length).toBeGreaterThan(0);
  });
});

describe('the activity log', () => {
  it('groups entries by day, newest first, and names today', async () => {
    renderPage(ActivityPage);

    const log = await screen.findByRole('list', { name: /Activity log/i });
    expect(within(log).getByRole('heading', { name: /Today/ })).toBeInTheDocument();
    expect(within(log).getByText('Ahmed Al Hawajri')).toBeInTheDocument();
  });

  it('shows what changed, old value beside the new', async () => {
    renderPage(ActivityPage);

    expect(await screen.findByText('staff')).toHaveClass('line-through');
    expect(screen.getByText('manager')).toBeInTheDocument();
  });

  it('counts the failed sign-ins of the week, and opens them in one tap', async () => {
    const user = userEvent.setup();
    renderPage(ActivityPage);

    const failed = await screen.findByRole('button', { name: /Failed sign-ins/ });
    expect(await within(failed).findByText('3')).toBeInTheDocument();

    await user.click(failed);
    expect(push.mock.calls.at(-1)[0]).toContain('category=security');
  });

  it('pages by cursor, with no page numbers', async () => {
    renderPage(ActivityPage);

    expect(await screen.findByRole('button', { name: 'Older' })).toBeEnabled();
    expect(screen.queryByText(/page \d+ of \d+/i)).toBeNull();
  });
});
