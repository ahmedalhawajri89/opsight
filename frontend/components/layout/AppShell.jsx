'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

import { useAuth } from '@/features/auth/AuthProvider';

/**
 * Navigation is filtered by ability, so a user never sees a link that would
 * 403 (ROLES_AND_PERMISSIONS.md §5).
 *
 * An entry without `ready: true` renders as disabled rather than as a dead link
 * that looks broken. Analytics stays disabled until Phase 04 builds the metric
 * layer behind it — a navigable page with invented numbers would be worse than
 * one that is honestly not there yet.
 */
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [{ href: '/dashboard', label: 'Dashboard', ability: 'dashboard.view', ready: true }],
  },
  {
    label: 'Operations',
    items: [
      { href: '/orders', label: 'Orders', ability: 'orders.view', ready: true },
      { href: '/customers', label: 'Customers', ability: 'customers.view', ready: true },
      { href: '/products', label: 'Products', ability: 'products.view', ready: true },
      { href: '/inventory', label: 'Inventory', ability: 'inventory.view', ready: true },
      { href: '/expenses', label: 'Expenses', ability: 'expenses.view', ready: true },
    ],
  },
  {
    label: 'Analysis',
    items: [{ href: '/analytics', label: 'Analytics', ability: 'analytics.view' }],
  },
  ...(process.env.NEXT_PUBLIC_ENABLE_GALLERY === 'true'
    ? [
        {
          label: 'Development',
          items: [
            {
              href: '/gallery',
              label: 'Component gallery',
              ability: 'dashboard.view',
              ready: true,
            },
          ],
        },
      ]
    : []),
  {
    label: 'Administration',
    items: [
      { href: '/activity', label: 'Activity log', ability: 'activity.view' },
      { href: '/settings/users', label: 'Users', ability: 'users.view' },
      { href: '/settings', label: 'Settings', ability: 'settings.view' },
    ],
  },
];

export function AppShell({ children }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  /*
   * Navigate explicitly rather than waiting for the layout's auth guard to
   * notice and redirect.
   *
   * Clearing the cache leaves the /me query briefly re-pending, and while it is
   * pending the guard sees "still loading" rather than "signed out" — so the
   * user would sit on a skeleton of the page they just left. A deliberate
   * action deserves a deliberate navigation; the reactive guard stays as the
   * safety net for sessions that expire on their own.
   */
  async function handleSignOut() {
    await logout();
    router.replace('/login');
  }

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.ability)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="flex min-h-dvh">
      {/* Logical properties only — this must survive dir="rtl" unchanged. */}
      <aside className="hidden w-60 shrink-0 border-e border-[--color-line] bg-[--color-surface] md:block">
        <div className="border-b border-[--color-line] px-4 py-4">
          <span className="text-base font-semibold tracking-tight text-[--color-text]">
            Opsight
          </span>
        </div>

        <nav aria-label="Main" className="px-2 py-3">
          {groups.map((group) => (
            <div key={group.label} className="mb-4">
              <h2 className="px-2 pb-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-[--color-text-subtle]">
                {group.label}
              </h2>

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href;

                  if (!item.ready) {
                    return (
                      <li key={item.href}>
                        <span
                          aria-disabled="true"
                          title="Arrives in a later phase"
                          className="flex cursor-not-allowed items-center justify-between rounded-[--radius-sm] px-2 py-1.5 text-sm text-[--color-text-subtle]"
                        >
                          {item.label}
                          <span className="text-[0.625rem] uppercase">soon</span>
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`block rounded-[--radius-sm] px-2 py-1.5 text-sm transition-colors ${
                          active
                            ? 'bg-[--color-accent-subtle] font-medium text-[--color-accent]'
                            : 'text-[--color-text-muted] hover:bg-[--color-surface-sunken]'
                        }`}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[--color-line] bg-[--color-surface] px-4 py-3">
          <span className="text-sm text-[--color-text-muted] md:hidden">Opsight</span>
          <div className="ms-auto flex items-center gap-3">
            <span className="text-sm text-[--color-text-muted]">{user.email}</span>
            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-[--radius-sm] border border-[--color-line-strong] px-2.5 py-1 text-sm text-[--color-text] transition-colors hover:bg-[--color-surface-sunken]"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
