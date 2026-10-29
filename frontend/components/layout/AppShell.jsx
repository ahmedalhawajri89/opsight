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
import { FocusControls } from '@/components/layout/FocusControls';
import { FocusHint } from '@/components/layout/FocusHint';
import { ShortcutsSheet } from '@/components/layout/ShortcutsSheet';
import { InstallPrompt } from '@/features/pwa/InstallPrompt';
import { Icon } from '@/components/ui/Icon';
import { Popover } from '@/components/ui/Popover';
import { Logo } from '@/components/layout/Logo';
import { cn } from '@/lib/cn';
import { PRESETS, PRESET_LABEL_COUNTS } from '@/lib/periods';
import { useI18n } from '@/features/i18n/I18nProvider';
import { NotificationsMenu } from '@/features/notifications/NotificationsMenu';
import { SearchDialog, TopBarSearch, useSearchShortcut } from '@/features/search/GlobalSearch';
import { useFlip } from '@/hooks/useFlip';
import { useShortcuts } from '@/hooks/useShortcuts';
import { useFocusMode } from '@/hooks/useFocusMode';
import { recordVisit, useSeenOnce } from '@/hooks/useSeenOnce';
import { useSidebarCollapsed } from '@/hooks/useSidebarCollapsed';
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
      // `box`, not `gallery`: a 2x2 grid of squares means "grid", and on the
      // icon rail the icon is the only label there is.
      { href: '/products', label: 'nav.items.products', icon: 'box', ability: 'products.view' },
      {
        href: '/inventory',
        label: 'nav.items.inventory',
        icon: 'shelves',
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
        href: '/settings/integrations',
        label: 'nav.items.integrations',
        icon: 'link',
        ability: 'integrations.manage',
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

/*
 * The letter that follows `g` for each destination.
 *
 * Chosen from the English name, not the Arabic one: a chord is muscle memory
 * on a physical keyboard, and a reader who switches language mid-session
 * should not have to relearn where things are. The activity log takes `l`
 * because `a` is already analytics, and users takes `u` because `s` is
 * settings — the two cases where the obvious initial was taken.
 */
const SHORTCUT_KEYS = {
  '/dashboard': 'd',
  '/orders': 'o',
  '/customers': 'c',
  '/products': 'p',
  '/inventory': 'i',
  '/expenses': 'e',
  '/analytics': 'a',
  '/activity': 'l',
  '/settings/users': 'u',
  '/settings': 's',
};

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
 * One inline inset for the bar and the page beneath it.
 *
 * Written once rather than twice because the two drifting apart is exactly
 * what went wrong before: the bar had `px-4 sm:px-6` and the page had those
 * plus a centred cap, so they shared an edge on a laptop and disagreed on
 * anything wider.
 *
 * The step at 120rem is the only concession to a very wide screen — 24px of
 * air reads as a hairline against 1900px of content — and it is a step, not
 * a cap: the content still reaches both edges.
 */
const CONTENT_INSET = 'px-4 sm:px-6 min-[120rem]:px-8';

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
  const { t, locale, numerals, setPreferences } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [slot, setSlot] = useState(null);
  const wideSearch = useMediaQuery('(min-width: 768px)');

  /*
   * Ctrl/⌘+K opens the palette, at every width.
   *
   * It used to focus the field in the bar instead, which was fine until the
   * field grew commands: a dropdown hanging off the top-right corner is the
   * wrong shape for a list someone is reading and choosing from, and it is
   * the wrong shape for a reader whose language puts that corner at the
   * other end. The bar's field stays for the reader who reached for a mouse.
   */
  useSearchShortcut(useCallback(() => setSearchOpen(true), []));

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

  const sidebar = (
    <Sidebar groups={groups} current={current} canAnalyse={can('analytics.view')} variant="full" />
  );

  /*
   * Focus mode (UI_UX_DIRECTION.md). The sidebar and top bar are this
   * application's furniture; a reader studying a month of figures can have
   * the room back.
   */
  const [shellScope, captureShell] = useFlip('[data-shell-flip]', { absolute: false });
  const focus = useFocusMode(captureShell);
  const [sidebarCollapsed, toggleSidebar] = useSidebarCollapsed();

  /*
   * The two widths the shell has, and the move between them.
   *
   * Folding the sidebar takes it from 216px to 72px and hands the difference
   * to the content; entering focus mode takes it away entirely. Both used to
   * be a single frame in which the whole page was suddenly a different shape,
   * which is the most violent thing this interface did — and it did it on the
   * two controls a reader presses most.
   *
   * `absolute: false`: these are the top-level flex children. Lifting them out
   * of flow for the tween would leave the row with nothing in it, and the
   * layout would collapse for 420ms before snapping back.
   *
   * Leaving focus mode re-inserts the sidebar, so Flip has no 'before' for it
   * and it simply appears — the content gliding aside is what carries the
   * change. Entering, it is React that removes the node, so there is nothing
   * left to animate out. Flip reports both as entering/leaving and skips them;
   * the content column is mounted either way and is the element that moves.
   */


  /*
   * One sentence, once, so the feature is findable. It also ends the moment
   * focus mode is first used: a reader who found it does not need telling.
   */
  /*
   * The commands the palette can run.
   *
   * Each one acts on something the shell already holds — the reader's
   * preferences, focus mode, the period in the URL — which is why they are
   * built here and handed down, rather than the search engine reaching for
   * a provider it has no other reason to know about.
   *
   * `keywords` are never shown. They are what somebody types when they think
   * of the thing by a different name: "logout" for sign out, "rtl" for
   * Arabic, "zen" for focus mode.
   */
  const onAnalyticalScreen = pathname === '/dashboard' || pathname === '/analytics';

  const commands = useMemo(() => {
    const items = [
      {
        key: 'command-focus',
        icon: 'focus',
        title: focus.focused ? t('shell.focus.leave') : t('shell.focus.enter'),
        detail: 'Shift + F',
        keywords: 'focus zen distraction sidebar hide تركيز',
        run: () => focus.toggleFocus(),
      },
      {
        key: 'command-language',
        icon: 'globe',
        title: locale === 'ar' ? 'English' : 'العربية',
        detail: t('preferences.language'),
        keywords: 'language locale arabic english rtl عربي لغة',
        run: () => setPreferences({ locale: locale === 'ar' ? 'en' : 'ar' }),
      },
    ];

    // Only ever offered in Arabic: the choice does not exist in English.
    if (locale === 'ar') {
      items.push({
        key: 'command-numerals',
        icon: 'analytics',
        title: numerals === 'arab' ? t('preferences.western') : t('preferences.arabicIndic'),
        detail: t('preferences.numerals'),
        keywords: 'numerals digits أرقام',
        run: () => setPreferences({ numerals: numerals === 'arab' ? 'latn' : 'arab' }),
      });
    }

    /*
     * The period lives in the URL, so setting it is a navigation — and it is
     * only offered on the two screens that read it. Offering it elsewhere
     * would push a parameter nothing on that page looks at.
     */
    if (onAnalyticalScreen) {
      for (const preset of [PRESETS.Last7, PRESETS.Last30, PRESETS.Last90, PRESETS.YearToDate]) {
        items.push({
          key: `command-period-${preset}`,
          icon: 'calendar',
          title: t(`period.presets.${preset}`, { count: PRESET_LABEL_COUNTS[preset] }),
          detail: t('period.selector.period'),
          keywords: `period range date ${preset} فترة مدة`,
          run: () => router.push(`${pathname}?preset=${preset}`),
        });
      }
    }

    items.push({
      key: 'command-shortcuts',
      icon: 'info',
      title: t('shell.shortcuts.title'),
      detail: '?',
      keywords: 'keyboard shortcuts keys help اختصارات',
      run: () => setShortcutsOpen(true),
    });

    items.push({
      key: 'command-sign-out',
      icon: 'signOut',
      title: t('nav.signOut'),
      keywords: 'sign out logout leave exit خروج',
      run: handleSignOut,
    });

    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, locale, numerals, focus.focused, onAnalyticalScreen, pathname]);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  /*
   * Only the destinations this role can actually open get a chord. A reader
   * whose account has no analytics screen should not learn `g a` from the
   * sheet and then press it into nothing.
   */
  const destinations = useMemo(
    () =>
      pages
        .filter((page) => SHORTCUT_KEYS[page.href])
        .map((page) => ({ ...page, key: SHORTCUT_KEYS[page.href] })),
    [pages],
  );

  const chords = useMemo(
    () =>
      Object.fromEntries(
        destinations.map((destination) => [destination.key, () => router.push(destination.href)]),
      ),
    [destinations, router],
  );

  const openShortcuts = useCallback(() => setShortcutsOpen(true), []);

  useShortcuts({ onHelp: openShortcuts, chords });

  const [showFocusHint, dismissFocusHint] = useSeenOnce('focus-mode');

  // Per session, not per navigation — see recordVisit.
  useEffect(() => {
    recordVisit();
  }, []);

  return (
    <div ref={shellScope} className="flex min-h-dvh">
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
      {/*
        Removed from the DOM in focus mode rather than hidden with CSS: a
        visually hidden sidebar is still in the tab order and still read out,
        so a keyboard or screen-reader user would tab through twelve
        invisible links to reach the content they asked to focus on.
      */}
      {!focus.focused && (
        <aside
          id="app-sidebar"
          data-shell-flip=""
          className={cn(
            'sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col border-e border-(--color-line) bg-(--color-sidebar) md:flex [view-transition-name:app-sidebar]',
            /*
             * Collapsed means a rail at every width. Not collapsed leaves
             * the decision to the layout, which is where it belonged before
             * anyone was asked.
             */
            !sidebarCollapsed && 'lg:w-[216px]',
          )}
        >
          <Sidebar
            groups={groups}
            current={current}
            canAnalyse={can('analytics.view')}
            variant={sidebarCollapsed ? 'rail' : 'auto'}
            collapsed={sidebarCollapsed}
            onToggle={() => {
              captureShell();
              toggleSidebar();
            }}
          />
        </aside>
      )}

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

      <div data-shell-flip="" className="flex min-w-0 flex-1 flex-col">
        <TopBarContext.Provider value={slot}>
          <header
            className={cn(
              CONTENT_INSET,
              'sticky top-0 z-30 flex h-[62px] shrink-0 items-center gap-3 border-b border-(--color-line) bg-(--color-surface)/95 backdrop-blur-sm [view-transition-name:app-topbar]',
            )}
          >
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
              <TopBarSearch pages={pages} commands={commands} />
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
              <FocusControls
                focused={focus.focused}
                fullscreen={focus.fullscreen}
                supported={focus.supported}
                onToggleFocus={() => {
                  dismissFocusHint();
                  focus.toggleFocus();
                }}
                onToggleFullscreen={() => {
                  dismissFocusHint();
                  focus.toggleFullscreen();
                }}
              />
              {/*
                The account menu is the way out of focus mode for a reader who
                does not know the shortcut and cannot see the sidebar, so it
                stays. Notifications do not: they are an interruption, which
                is the one thing focus mode exists to remove.
              */}
              {!focus.focused && <NotificationsMenu />}
              <UserMenu user={user} onSignOut={handleSignOut} />
            </div>
          </header>

          <SearchDialog
            open={searchOpen}
            onClose={() => setSearchOpen(false)}
            pages={pages}
            commands={commands}
          />

          {/*
            tabIndex -1 lets the skip link move focus here. The outline is
            suppressed on THIS element only: <main> is a landing point, not a
            control.

            No reading measure, and the same inline inset as the bar above.
            This used to be `mx-auto max-w-[1760px]`, which on a screen wider
            than that centred the page inside its own column and left a dead
            band down each side — while the top bar, which has no cap, ran to
            both edges. So the search field sat 24px from the edge and the
            first card 136px from it: two left margins on one screen.

            A reading measure is for prose. §5 of UI_UX_DIRECTION already says
            a wide table may have the full width because "constraining a wide
            table to a reading measure helps nobody"; a grid of panels is the
            same argument. The long-form text that does need a measure carries
            its own — PageHeader caps its description at 3xl, the settings
            forms at xl, FocusColumn at 110.
          */}
          <main
            id="main-content"
            tabIndex={-1}
            className={cn(CONTENT_INSET, 'w-full min-w-0 flex-1 py-5 focus:outline-none lg:py-6')}
          >
            {/*
              Above the content and in its flow, so it takes a line of its
              own rather than landing on top of what the reader came for.
            */}
            <FocusHint show={showFocusHint} onDismiss={dismissFocusHint} />

            {children}
          </main>

          <ShortcutsSheet
            open={shortcutsOpen}
            onClose={() => setShortcutsOpen(false)}
            destinations={destinations}
          />

          <InstallPrompt />
        </TopBarContext.Provider>
      </div>
    </div>
  );
}

/*
 * Three forms of one sidebar, as class sets rather than a boolean with `lg:`
 * escapes sprinkled through it.
 *
 * There used to be two, and `compact` meant "a rail that unfolds itself at
 * 1024px". Letting the reader fold it by choice makes a third state that
 * the boolean could not express: a rail at EVERY width, including the one
 * where the layout would have unfolded it.
 *
 *   full  the drawer on a phone, where the sidebar is the whole screen
 *   auto  the layout decides: a rail under 1024px, names above it
 *   rail  the reader decided: icons at every width
 */
const SIDEBAR = {
  full: {
    header: 'px-5',
    nav: 'px-3',
    item: 'gap-3 px-3',
    label: '',
    group: '',
    rule: 'hidden',
    markSmall: 'hidden',
    markFull: 'block',
    foot: '',
    toggle: 'hidden',
  },
  auto: {
    header: 'justify-center lg:justify-start lg:px-5',
    nav: 'px-2 lg:px-3',
    item: 'justify-center lg:justify-start lg:gap-3 lg:px-3',
    label: 'sr-only lg:not-sr-only',
    group: 'hidden lg:block',
    rule: 'lg:hidden',
    markSmall: 'lg:hidden',
    markFull: 'hidden lg:block',
    foot: 'hidden lg:block',
    toggle: 'justify-center lg:justify-start lg:gap-3 lg:px-3',
  },
  rail: {
    header: 'justify-center',
    nav: 'px-2',
    item: 'justify-center',
    label: 'sr-only',
    group: 'hidden',
    rule: '',
    markSmall: '',
    markFull: 'hidden',
    foot: 'hidden',
    toggle: 'justify-center',
  },
};

function Sidebar({ groups, current, canAnalyse, variant = 'full', collapsed = false, onToggle }) {
  const { t } = useI18n();
  const style = SIDEBAR[variant] ?? SIDEBAR.full;
  const compact = variant !== 'full';

  return (
    <>
      <div className={cn('flex h-16 shrink-0 items-center', style.header)}>
        <Link
          href="/dashboard"
          className="rounded-(--radius-control)"
          aria-label={t('common.appName')}
        >
          {/* The wordmark needs room; the rail shows the mark alone. */}
          <span className={style.markSmall}>
            <Logo compact />
          </span>
          <span className={style.markFull}>
            <Logo />
          </span>
        </Link>
      </div>

      <nav aria-label={t('nav.main')} className={cn('flex-1 overflow-y-auto pt-1 pb-4', style.nav)}>
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
                    style.group,
                  )}
                >
                  {t(group.label)}
                </p>
              )}
              {group.label && compact && (
                <div
                  aria-hidden="true"
                  className={cn('mx-2 mb-2 h-px bg-(--color-line)', style.rule)}
                />
              )}

              <ul aria-labelledby={group.label ? id : undefined} className="space-y-1">
                {group.items.map((item) => (
                  <li key={item.href}>
                    {item.ready === false ? (
                      <DisabledNavItem item={item} style={style} compact={compact} />
                    ) : (
                      <NavLink
                        item={item}
                        active={current === item.href}
                        style={style}
                        compact={compact}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>

      {/*
        Folding the navigation away.

        At the FOOT and in every form, rather than beside the mark: one
        placement to read and one set of classes to keep true, and it never
        crowds the logo on the rail. Hidden in the drawer, where the sidebar
        IS the screen and folding it to icons would leave a phone showing a
        column of glyphs over a page it is already covering.

        `aria-expanded` with `aria-controls`, so it announces the state of
        the thing it operates rather than merely naming itself.
      */}
      {onToggle && (
        <div className={cn('shrink-0 px-2 pb-2 lg:px-3', style.toggle === 'hidden' && 'hidden')}>
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            aria-controls="app-sidebar"
            title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            className={cn(
              'flex h-9 w-full items-center rounded-(--radius-control) text-start text-sm font-medium whitespace-nowrap text-(--color-text-2) transition-colors duration-(--duration-fast) hover:bg-(--color-surface-hover) hover:text-(--color-text)',
              style.toggle,
            )}
          >
            <Icon name="panel" size={18} className="text-(--color-muted)" />
            <span className={style.label}>
              {collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
            </span>
          </button>
        </div>
      )}

      {/* The promo card and version line need width; the rail omits them. */}
      <div className={cn('shrink-0 px-3 pb-4', style.foot)}>
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

function NavLink({ item, active, style, compact = false }) {
  const { t } = useI18n();
  const label = t(item.label);

  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      title={compact ? label : undefined}
      className={cn(
        'flex h-9 items-center rounded-(--radius-control) text-sm transition-colors duration-(--duration-fast) ease-(--ease-out)',
        style.item,
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
      <span className={style.label}>{label}</span>
    </Link>
  );
}

function DisabledNavItem({ item, style, compact = false }) {
  const { t } = useI18n();

  return (
    <span
      aria-disabled="true"
      title={`${t(item.label)} — ${t('nav.comingLater')}`}
      className={cn(
        'flex h-9 cursor-not-allowed items-center rounded-(--radius-control) text-sm font-medium text-(--color-muted)',
        style.item,
      )}
    >
      <Icon name={item.icon} size={18} />
      <span className={cn('flex-1', style.label)}>{t(item.label)}</span>
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

          <Link
            href="/profile"
            className="flex w-full items-center gap-2.5 rounded-(--radius-control) px-3 py-2 text-sm text-(--color-text) hover:bg-(--color-surface-hover)"
          >
            <Icon name="userCircle" className="text-(--color-text-2)" />
            <span className="flex-1">{t('shell.profile')}</span>
          </Link>

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
