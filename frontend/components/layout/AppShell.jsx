'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

import packageInfo from '@/package.json';
import { useAuth } from '@/features/auth/AuthProvider';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Popover';
import { Logo } from '@/components/layout/Logo';
import { cn } from '@/lib/cn';
import { useI18n } from '@/features/i18n/I18nProvider';
import { NotificationsMenu } from '@/features/notifications/NotificationsMenu';
import { SearchDialog, TopBarSearch, useSearchShortcut } from '@/features/search/GlobalSearch';
import { useMediaQuery } from '@/hooks/useMediaQuery';

/**
 * Navigation is filtered by ability, so a user never sees a link that would
 * 403 (ROLES_AND_PERMISSIONS.md §5). Labels are dictionary KEYS, resolved at
 * render time, so the navigation follows the reader's language.
 *
 * A group without a label renders its items unheaded — the dashboard sits
 * alone at the top, as the place every session starts.
 */
const NAV_GROUPS = [
  {
    label: null,
    items: [
      { href: '/dashboard', label: 'nav.items.dashboard', icon: 'home', ability: 'dashboard.view' },
    ],
  },
  {
    label: 'nav.groups.operations',
    items: [
      { href: '/orders', label: 'nav.items.orders', icon: 'orders', ability: 'orders.view' },
      {
        href: '/customers',
        label: 'nav.items.customers',
        icon: 'customers',
        ability: 'customers.view',
      },
      { href: '/products', label: 'nav.items.products', icon: 'gallery', ability: 'products.view' },
      {
        href: '/inventory',
        label: 'nav.items.inventory',
        icon: 'inventory',
        ability: 'inventory.view',
      },
      {
        href: '/expenses',
        label: 'nav.items.expenses',
        icon: 'expenses',
        ability: 'expenses.view',
      },
    ],
  },
  {
    label: 'nav.groups.analysis',
    items: [
      {
        href: '/analytics',
        label: 'nav.items.analytics',
        icon: 'chart',
        ability: 'analytics.view',
      },
      // Not built yet: shown disabled and labelled, never as a link to nothing.
      {
        href: '/reports',
        label: 'nav.items.reports',
        icon: 'fileChart',
        ability: 'analytics.view',
        ready: false,
      },
    ],
  },
  ...(process.env.NEXT_PUBLIC_ENABLE_GALLERY === 'true'
    ? [
        {
          label: 'nav.groups.development',
          items: [
            {
              href: '/gallery',
              label: 'nav.items.gallery',
              icon: 'dashboard',
              ability: 'dashboard.view',
            },
          ],
        },
      ]
    : []),
  {
    label: 'nav.groups.administration',
    items: [
      {
        href: '/settings/users',
        label: 'nav.items.users',
        icon: 'userCircle',
        ability: 'users.view',
      },
      {
        href: '/activity',
        label: 'nav.items.activity',
        icon: 'activity',
        ability: 'activity.view',
      },
      {
        href: '/settings',
        label: 'nav.items.settings',
        icon: 'settings',
        ability: 'settings.view',
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

/*
 * The top bar's page slot.
 *
 * A screen can place its own controls in the shared top bar — the dashboard
 * puts its date range there — without the shell knowing about any screen. The
 * bar exposes an element through a callback ref (state set from a ref
 * callback, not from an effect), and the screen portals into it.
 */
const TopBarContext = createContext(null);

export function TopBarPortal({ children }) {
  const slot = useContext(TopBarContext);

  return slot ? createPortal(children, slot) : null;
}

export function AppShell({ children }) {
  const { user, can, logout } = useAuth();
  const { t } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [slot, setSlot] = useState(null);
  const barSearch = useRef(null);
  const wideSearch = useMediaQuery('(min-width: 768px)');

  // Ctrl/⌘+K focuses the field in the bar; where the bar has only an icon,
  // it opens the same field in a dialog.
  const focusSearch = useCallback(() => {
    if (wideSearch) barSearch.current?.focus();
    else setSearchOpen(true);
  }, [wideSearch]);
  useSearchShortcut(focusSearch);

  /*
   * Navigate explicitly rather than waiting for the layout's auth guard to
   * notice and redirect: clearing the cache leaves /me briefly re-pending, and
   * the user would sit on a skeleton of the page they just left.
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

  const groups = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => can(item.ability)),
      })).filter((group) => group.items.length > 0),
    [can],
  );

  const current = activeHref(pathname, groups);

  const pages = useMemo(
    () =>
      groups.flatMap((group) =>
        group.items
          // A screen that does not exist yet is not a search result.
          .filter((item) => item.ready !== false)
          .map((item) => ({ href: item.href, icon: item.icon, label: t(item.label) })),
      ),
    [groups, t],
  );

  const sidebar = <Sidebar groups={groups} current={current} canAnalyse={can('analytics.view')} />;

  return (
    <div className="flex min-h-dvh">
      {/*
        Skip link: first in the tab order, visible only when focused. Without it
        a keyboard user tabs through every navigation entry on every page
        before reaching the content they came for.
      */}
      <a
        href="#main-content"
        className="sr-only z-50 rounded-(--radius-control) bg-(--color-surface) px-3 py-2 text-base font-medium text-(--color-brand-text) shadow-(--shadow-overlay) focus:not-sr-only focus:fixed focus:start-3 focus:top-3"
      >
        {t('nav.skipToContent')}
      </a>

      {/*
        Three forms of the same navigation: the full sidebar from 1024px, an
        icon rail from 768px — where 216px of names would cost the content a
        fifth of the screen — and a drawer below that.
      */}
      <aside className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col border-e border-(--color-line) bg-(--color-sidebar) md:flex lg:w-[216px] [view-transition-name:app-sidebar]">
        <Sidebar groups={groups} current={current} canAnalyse={can('analytics.view')} compact />
      </aside>

      {drawerOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label={t('nav.closeNavigation')}
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 size-full bg-(--color-text)/25"
          />
          <aside className="absolute inset-y-0 start-0 flex w-64 max-w-[85vw] flex-col border-e border-(--color-line) bg-(--color-sidebar) shadow-(--shadow-overlay)">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBarContext.Provider value={slot}>
          <header className="sticky top-0 z-30 flex h-[62px] shrink-0 items-center gap-3 border-b border-(--color-line) bg-(--color-surface)/95 px-4 backdrop-blur-sm sm:px-6 [view-transition-name:app-topbar]">
            <button
              type="button"
              onClick={() => {
                setOpenedAt(pathname);
                setDrawerOpen(true);
              }}
              aria-expanded={drawerOpen}
              aria-label={t('nav.openNavigation')}
              className="-ms-1.5 inline-flex size-9 items-center justify-center rounded-(--radius-control) text-(--color-text-2) hover:bg-(--color-surface-hover) md:hidden"
            >
              <Icon name="menu" size={20} />
            </button>

            {wideSearch ? (
              <TopBarSearch ref={barSearch} pages={pages} />
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label={t('search.label')}
                className="inline-flex size-9 items-center justify-center rounded-(--radius-control) text-(--color-text-2) hover:bg-(--color-surface-hover)"
              >
                <Icon name="search" size={19} />
              </button>
            )}

            <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
              <div ref={setSlot} className="flex min-w-0 items-center gap-2" />
              <NotificationsMenu />
              <UserMenu user={user} onSignOut={handleSignOut} />
            </div>
          </header>

          {!wideSearch && (
            <SearchDialog open={searchOpen} onClose={() => setSearchOpen(false)} pages={pages} />
          )}

          {/*
            tabIndex -1 lets the skip link move focus here. The outline is
            suppressed on THIS element only: <main> is a landing point, not a
            control.
          */}
          <main
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1760px] flex-1 px-4 py-5 focus:outline-none sm:px-6 lg:py-6"
          >
            {children}
          </main>
        </TopBarContext.Provider>
      </div>
    </div>
  );
}

function Sidebar({ groups, current, canAnalyse, compact = false }) {
  const { t } = useI18n();

  return (
    <>
      <div
        className={cn(
          'flex h-16 shrink-0 items-center',
          compact ? 'justify-center lg:justify-start lg:px-5' : 'px-5',
        )}
      >
        <Link
          href="/dashboard"
          className="rounded-(--radius-control)"
          aria-label={t('common.appName')}
        >
          {/* The wordmark needs room; the rail shows the mark alone. */}
          <span className={compact ? 'lg:hidden' : 'hidden'}>
            <Logo compact />
          </span>
          <span className={compact ? 'hidden lg:block' : 'block'}>
            <Logo />
          </span>
        </Link>
      </div>

      <nav
        aria-label={t('nav.main')}
        className={cn('flex-1 overflow-y-auto pt-1 pb-4', compact ? 'px-2 lg:px-3' : 'px-3')}
      >
        {groups.map((group, index) => {
          const id = group.label ? `nav-${group.label.replaceAll('.', '-')}` : `nav-group-${index}`;

          return (
            <div key={id} className={cn(index > 0 && 'mt-6')}>
              {/*
                A label, not a heading: as <h2>s these put headings in the
                outline BEFORE the page's <h1>.
              */}
              {group.label && (
                <p
                  id={id}
                  className={cn(
                    'px-3 pb-2 text-xs font-medium tracking-[0.1em] text-(--color-muted) uppercase',
                    // On the rail the group is shown by a rule instead of a word.
                    compact && 'hidden lg:block',
                  )}
                >
                  {t(group.label)}
                </p>
              )}
              {group.label && compact && (
                <div aria-hidden="true" className="mx-2 mb-2 h-px bg-(--color-line) lg:hidden" />
              )}

              <ul aria-labelledby={group.label ? id : undefined} className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    {item.ready === false ? (
                      <DisabledNavItem item={item} compact={compact} />
                    ) : (
                      <NavLink item={item} active={current === item.href} compact={compact} />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/* The promo card and version line need width; the rail omits them. */}
      <div className={cn('shrink-0 px-3 pb-4', compact && 'hidden lg:block')}>
        <div className="rounded-(--radius-card) bg-(--color-brand-soft) p-4">
          <span
            aria-hidden="true"
            className="inline-flex size-8 items-center justify-center rounded-(--radius-control) bg-(--color-brand-text) text-(--color-text-inverse)"
          >
            <Icon name="chart" size={16} strokeWidth={2} />
          </span>
          <p className="mt-3 text-sm leading-snug font-semibold text-(--color-text)">
            {t('shell.promo.title')}
          </p>
          <div className="mt-1.5 flex items-end justify-between gap-2">
            <p className="text-xs leading-relaxed text-(--color-text-2)">{t('shell.promo.body')}</p>
            {canAnalyse && (
              <Link
                href="/analytics"
                aria-label={t('nav.items.analytics')}
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-(--color-surface) text-(--color-brand-text) shadow-(--shadow-card) transition-colors duration-(--duration-fast) hover:bg-(--color-surface-hover)"
              >
                <Icon name="arrowRight" size={14} className="rtl:-scale-x-100" />
              </Link>
            )}
          </div>
        </div>

        <p className="mt-4 px-2 text-xs text-(--color-muted)">v{packageInfo.version}</p>
      </div>
    </>
  );
}

function NavLink({ item, active, compact = false }) {
  const { t } = useI18n();
  const label = t(item.label);

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={compact ? label : undefined}
      className={cn(
        'flex h-9 items-center rounded-(--radius-control) text-sm transition-colors duration-(--duration-fast) ease-(--ease-out)',
        compact ? 'justify-center lg:justify-start lg:gap-3 lg:px-3' : 'gap-3 px-3',
        active
          ? 'bg-(--color-brand-soft) font-semibold text-(--color-brand-text)'
          : 'font-medium text-(--color-text-2) hover:bg-(--color-surface-hover) hover:text-(--color-text)',
      )}
    >
      <Icon
        name={item.icon}
        size={18}
        className={active ? 'text-(--color-brand-text)' : 'text-(--color-muted)'}
      />
      {/* On the rail the name is the tooltip and the accessible name. */}
      <span className={compact ? 'sr-only lg:not-sr-only' : undefined}>{label}</span>
    </Link>
  );
}

function DisabledNavItem({ item, compact = false }) {
  const { t } = useI18n();

  return (
    <span
      aria-disabled="true"
      title={`${t(item.label)} — ${t('nav.comingLater')}`}
      className={cn(
        'flex h-9 cursor-not-allowed items-center rounded-(--radius-control) text-sm font-medium text-(--color-muted)',
        compact ? 'justify-center lg:justify-start lg:gap-3 lg:px-3' : 'gap-3 px-3',
      )}
    >
      <Icon name={item.icon} size={18} />
      <span className={cn('flex-1', compact && 'sr-only lg:not-sr-only')}>{t(item.label)}</span>
      <span className="sr-only">{t('nav.comingLater')}</span>
    </span>
  );
}

/** A two-option switch whose options apply immediately. */
function Choice({ options, value, onChange }) {
  return (
    <span className="flex rounded-(--radius-control) border border-(--color-line) p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          lang={option.lang}
          aria-pressed={value === option.value}
          aria-label={option.ariaLabel}
          onClick={() => value !== option.value && onChange(option.value)}
          className={cn(
            'rounded-(--radius-control) px-2 py-0.5 text-xs transition-colors duration-(--duration-fast)',
            value === option.value
              ? 'bg-(--color-brand) font-semibold text-(--color-text-inverse)'
              : 'text-(--color-text-2) hover:bg-(--color-surface-hover)',
          )}
        >
          {option.label}
        </button>
      ))}
    </span>
  );
}

function UserMenu({ user, onSignOut }) {
  const { t, locale, numerals, setPreferences } = useI18n();

  return (
    <Popover
      panelClassName="w-72"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={t('shell.account', { name: user.name })}
          className="flex items-center gap-2.5 rounded-(--radius-control) py-1 ps-1 pe-1.5 transition-colors hover:bg-(--color-surface-hover)"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-(--color-brand) text-xs font-semibold text-(--color-text-inverse)"
          >
            {initials(user.name)}
          </span>
          <span className="hidden min-w-0 text-start sm:block">
            <span className="block max-w-36 truncate text-sm font-semibold text-(--color-text)">
              {user.name}
            </span>
            <span className="block text-xs text-(--color-text-2)">{user.role_label}</span>
          </span>
          <Icon name="chevronDown" size={14} className="hidden text-(--color-muted) sm:block" />
        </button>
      )}
    >
      {() => (
        <div className="p-1.5">
          <div className="px-3 py-2.5">
            <p className="truncate text-base font-semibold text-(--color-text)">{user.name}</p>
            <p className="truncate text-xs text-(--color-text-2)">{user.email}</p>
            {/* Which business this session acts for: one installation now
                serves several, and every figure below belongs to this one. */}
            {user.business?.name && (
              <p className="mt-1.5 flex items-center gap-1.5 text-xs text-(--color-text-2)">
                <Icon name="home" size={12} className="shrink-0 text-(--color-muted)" />
                <span className="truncate">{user.business.name}</span>
              </p>
            )}
          </div>
          <div className="my-1 h-px bg-(--color-line-subtle)" />

          {/* No profile screen exists yet: listed, disabled and labelled. */}
          <span
            aria-disabled="true"
            title={t('nav.comingLater')}
            className="flex w-full cursor-not-allowed items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-sm text-(--color-muted)"
          >
            <Icon name="userCircle" />
            <span className="flex-1">{t('shell.profile')}</span>
            <span className="sr-only">{t('nav.comingLater')}</span>
          </span>

          {/*
            Language is reachable by every role from every screen: it is a
            personal preference, and the person who most needs to change it is
            the one who cannot read the current one — so each option is named
            in its own script, and choosing one applies it at once.
          */}
          <div
            role="group"
            aria-label={t('preferences.language')}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-(--color-text)"
          >
            <Icon name="globe" className="text-(--color-text-2)" />
            <span className="flex-1">{t('preferences.language')}</span>
            <Choice
              options={[
                { value: 'en', label: 'English', lang: 'en' },
                { value: 'ar', label: 'العربية', lang: 'ar' },
              ]}
              value={locale}
              onChange={(next) => setPreferences({ locale: next })}
            />
          </div>

          {locale === 'ar' && (
            <div
              role="group"
              aria-label={t('preferences.numerals')}
              className="flex items-center gap-2.5 px-3 py-2 text-sm text-(--color-text)"
            >
              <span aria-hidden="true" className="w-4 text-center text-(--color-text-2)">
                #
              </span>
              <span className="flex-1">{t('preferences.numerals')}</span>
              <Choice
                options={[
                  { value: 'latn', label: '123', ariaLabel: t('preferences.western') },
                  { value: 'arab', label: '١٢٣', ariaLabel: t('preferences.arabicIndic') },
                ]}
                value={numerals}
                onChange={(next) => setPreferences({ numerals: next })}
              />
            </div>
          )}

          <div className="my-1 h-px bg-(--color-line-subtle)" />
          <button
            type="button"
            onClick={onSignOut}
            className="flex w-full items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-sm text-(--color-text) hover:bg-(--color-surface-hover)"
          >
            <Icon name="signOut" className="text-(--color-text-2)" />
            {t('nav.signOut')}
          </button>
        </div>
      )}
    </Popover>
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
