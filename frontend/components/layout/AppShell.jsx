'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

import { useAuth } from '@/features/auth/AuthProvider';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';

/**
 * Navigation is filtered by ability, so a user never sees a link that would
 * 403 (ROLES_AND_PERMISSIONS.md §5).
 *
 * An entry without `ready: true` renders as disabled rather than as a dead link
 * that looks broken.
 */
const NAV_GROUPS = [
  {
    label: 'Overview',
    items: [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: 'dashboard',
        ability: 'dashboard.view',
        ready: true,
      },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/orders', label: 'Orders', icon: 'orders', ability: 'orders.view', ready: true },
      {
        href: '/customers',
        label: 'Customers',
        icon: 'customers',
        ability: 'customers.view',
        ready: true,
      },
      {
        href: '/products',
        label: 'Products',
        icon: 'products',
        ability: 'products.view',
        ready: true,
      },
      {
        href: '/inventory',
        label: 'Inventory',
        icon: 'inventory',
        ability: 'inventory.view',
        ready: true,
      },
      {
        href: '/expenses',
        label: 'Expenses',
        icon: 'expenses',
        ability: 'expenses.view',
        ready: true,
      },
    ],
  },
  {
    label: 'Analysis',
    items: [
      {
        href: '/analytics',
        label: 'Analytics',
        icon: 'analytics',
        ability: 'analytics.view',
        ready: true,
      },
    ],
  },
  ...(process.env.NEXT_PUBLIC_ENABLE_GALLERY === 'true'
    ? [
        {
          label: 'Development',
          items: [
            {
              href: '/gallery',
              label: 'Component gallery',
              icon: 'gallery',
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
      {
        href: '/activity',
        label: 'Activity log',
        icon: 'activity',
        ability: 'activity.view',
        ready: true,
      },
      {
        href: '/settings/users',
        label: 'Users',
        icon: 'users',
        ability: 'users.view',
        ready: true,
      },
      {
        href: '/settings',
        label: 'Settings',
        icon: 'settings',
        ability: 'settings.view',
        ready: true,
      },
    ],
  },
];

/**
 * The most specific matching entry is active, so /settings/users highlights
 * Users and not also Settings, while /orders/41 still highlights Orders.
 */
function activeHref(pathname, groups) {
  const hrefs = groups.flatMap((group) => group.items.map((item) => item.href));

  return (
    hrefs
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

export function AppShell({ children }) {
  const { user, can, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  // A drawer left open across a navigation covers the page the user asked for.
  const [openedAt, setOpenedAt] = useState(pathname);
  if (drawerOpen && openedAt !== pathname) {
    setDrawerOpen(false);
  }

  useEffect(() => {
    if (!drawerOpen) return undefined;

    const onKey = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const groups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(item.ability)),
  })).filter((group) => group.items.length > 0);

  const current = activeHref(pathname, groups);

  return (
    <div className="flex min-h-dvh">
      {/*
        Skip link: first in the tab order, visible only when focused. Without it
        a keyboard user tabs through every navigation entry on every page
        before reaching the content they came for.
      */}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-(--radius-sm) bg-(--color-surface) px-3 py-2 text-sm font-medium text-(--color-accent-text) shadow-(--shadow-overlay) focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        Skip to content
      </a>

      {/*
        Persistent from 1024px. Below that the same navigation is a drawer: a
        240px rail leaves too little width for a table at tablet sizes, and
        before this redesign the rail simply vanished below 768px with nothing
        in its place, leaving phone users no way to move between modules.
      */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-e border-(--color-line) bg-(--color-surface) lg:flex">
        <Sidebar groups={groups} current={current} user={user} onSignOut={handleSignOut} />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 size-full bg-(--color-text)/25"
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 max-w-[85vw] flex-col border-e border-(--color-line) bg-(--color-surface) shadow-(--shadow-overlay)">
            <Sidebar groups={groups} current={current} user={user} onSignOut={handleSignOut} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-13 items-center gap-3 border-b border-(--color-line) bg-(--color-surface) px-4 lg:hidden">
          <button
            type="button"
            onClick={() => {
              setOpenedAt(pathname);
              setDrawerOpen(true);
            }}
            aria-expanded={drawerOpen}
            aria-label="Open navigation"
            className="-ms-1.5 inline-flex size-9 items-center justify-center rounded-(--radius-sm) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-hover) hover:text-(--color-text)"
          >
            <Icon name="menu" size={20} />
          </button>
          <Brand />
        </header>

        {/*
          tabIndex -1 lets the skip link move focus here. The outline is
          suppressed on THIS element only: <main> is a landing point, not a
          control, and a focus ring around the entire page after skipping
          conveys nothing — the prohibition on outline:none is about controls,
          which all keep theirs.
        */}
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 focus:outline-none sm:px-6 lg:px-8 lg:py-7"
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <span className="flex items-center gap-2.5">
      {/* The product mark: a bar chart in the accent. Identity, used once. */}
      <span
        aria-hidden="true"
        className="inline-flex size-7 items-center justify-center rounded-(--radius-md) bg-(--color-accent) text-(--color-text-inverse)"
      >
        <Icon name="analytics" size={16} strokeWidth={2.25} />
      </span>
      <span className="text-[0.9375rem] font-semibold tracking-tight text-(--color-text)">
        Opsight
      </span>
    </span>
  );
}

function Sidebar({ groups, current, user, onSignOut }) {
  return (
    <>
      <div className="flex h-15 shrink-0 items-center px-5">
        <Brand />
      </div>

      <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4 pt-1">
        {groups.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            {/*
              A label, not a heading. As <h2>s these put five headings in the
              outline BEFORE the page's <h1>, so a screen-reader user jumping by
              heading met "Overview, Operations, Analysis…" before the page
              they were on. The list is named by the label instead.
            */}
            <p
              id={`nav-${group.label}`}
              className="px-2.5 pb-1.5 text-[0.6875rem] font-medium tracking-[0.06em] text-(--color-text-subtle) uppercase"
            >
              {group.label}
            </p>

            <ul aria-labelledby={`nav-${group.label}`} className="space-y-px">
              {group.items.map((item) =>
                item.ready ? (
                  <li key={item.href}>
                    <NavLink item={item} active={current === item.href} />
                  </li>
                ) : (
                  <li key={item.href}>
                    <span
                      aria-disabled="true"
                      title="Arrives in a later phase"
                      className="flex cursor-not-allowed items-center gap-2.5 rounded-(--radius-sm) px-2.5 py-1.5 text-[0.8125rem] text-(--color-text-subtle)"
                    >
                      <Icon name={item.icon} />
                      {item.label}
                    </span>
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </nav>

      <div className="shrink-0 border-t border-(--color-line) p-3">
        <div className="flex items-center gap-2.5 rounded-(--radius-md) px-2 py-1.5">
          <span
            aria-hidden="true"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-surface-hover) text-xs font-semibold text-(--color-text-muted)"
          >
            {initials(user.name)}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.8125rem] font-medium text-(--color-text)">{user.name}</p>
            <p className="truncate text-xs text-(--color-text-muted)">
              {user.role_label} · <span>{user.email}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={onSignOut}
            title="Sign out"
            aria-label="Sign out"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-sm) text-(--color-text-muted) transition-colors hover:bg-(--color-surface-hover) hover:text-(--color-text)"
          >
            <Icon name="signOut" />
          </button>
        </div>
      </div>
    </>
  );
}

function NavLink({ item, active }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex items-center gap-2.5 rounded-(--radius-sm) px-2.5 py-1.5 text-[0.8125rem] transition-colors duration-150',
        active
          ? 'bg-(--color-accent-subtle) font-medium text-(--color-accent-text)'
          : 'text-(--color-text-muted) hover:bg-(--color-surface-hover) hover:text-(--color-text)',
      )}
    >
      {/*
        The active marker is a bar on the inline-start edge as well as a tint,
        so the current page is identifiable without relying on colour alone.
      */}
      {active && (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 start-0 w-0.5 rounded-full bg-(--color-accent)"
        />
      )}
      <Icon name={item.icon} className={active ? undefined : 'text-(--color-text-subtle)'} />
      {item.label}
    </Link>
  );
}

function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '·'
  );
}
