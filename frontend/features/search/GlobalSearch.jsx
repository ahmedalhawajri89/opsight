'use client';

import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { listCustomers, listProducts } from '@/services/catalog';
import { listOrders } from '@/services/orders';

/**
 * Search across the application: screens, orders, customers and products.
 *
 * Every result comes from an endpoint the user could already open, through its
 * own policy — search adds no API surface and can surface nothing the list
 * screens would not. A source the role cannot view is not queried at all, so a
 * Staff member's search never even asks about expenses.
 *
 * Two faces over one engine: the field in the top bar, whose results drop down
 * beneath it (Ctrl/⌘+K focuses it), and on a narrow screen an icon that opens
 * the same field in a dialog. Arrow keys move, Enter opens, Escape closes.
 */
const MIN_QUERY = 2;
const LIMIT = 5;

export function useSearchShortcut(onTrigger) {
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onTrigger();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [onTrigger]);
}

/* -------------------------------------------------------------------------- */
/* Engine                                                                      */
/* -------------------------------------------------------------------------- */

function useSource(term, allowed, key, fetcher) {
  return useQuery({
    queryKey: ['search', key, term],
    queryFn: async () => (await fetcher()).data ?? [],
    enabled: allowed && term !== '',
    staleTime: 30_000,
  });
}

function useSearch(query, pages) {
  const { t } = useI18n();
  const { can } = useAuth();
  const debounced = useDebouncedValue(query.trim());
  const term = debounced.length >= MIN_QUERY ? debounced : '';

  const orders = useSource(term, can('orders.view'), 'orders', () =>
    listOrders({ page: 1, per_page: LIMIT, filter: { search: term } }),
  );
  const customers = useSource(term, can('customers.view'), 'customers', () =>
    listCustomers({ page: 1, per_page: LIMIT, filter: { search: term } }),
  );
  const products = useSource(term, can('products.view'), 'products', () =>
    listProducts({ page: 1, per_page: LIMIT, filter: { search: term } }),
  );

  const needle = query.trim().toLowerCase();

  const groups = [
    {
      key: 'pages',
      label: t('search.groups.pages'),
      items: pages
        .filter((page) => !needle || page.label.toLowerCase().includes(needle))
        .slice(0, needle ? 5 : 8)
        .map((page) => ({ key: page.href, href: page.href, icon: page.icon, title: page.label })),
    },
    {
      key: 'orders',
      label: t('search.groups.orders'),
      items: (orders.data ?? []).map((order) => ({
        key: `order-${order.id}`,
        href: `/orders/${order.id}`,
        icon: 'orders',
        title: order.reference,
        detail: [
          order.customer?.name ?? t('common.walkIn'),
          order.total_amount != null ? formatMoney(order.total_amount) : null,
        ]
          .filter(Boolean)
          .join(' · '),
      })),
    },
    {
      key: 'customers',
      label: t('search.groups.customers'),
      items: (customers.data ?? []).map((customer) => ({
        key: `customer-${customer.id}`,
        href: `/customers?search=${encodeURIComponent(customer.name)}`,
        icon: 'customers',
        title: customer.display_name ?? customer.name,
        detail: customer.email ?? customer.company ?? '',
      })),
    },
    {
      key: 'products',
      label: t('search.groups.products'),
      items: (products.data ?? []).map((product) => ({
        key: `product-${product.id}`,
        href: `/products?search=${encodeURIComponent(product.sku)}`,
        icon: 'products',
        title: product.display_name ?? product.name,
        detail: product.sku,
      })),
    },
  ].filter((group) => group.items.length > 0);

  const loading =
    Boolean(term) && (orders.isFetching || customers.isFetching || products.isFetching);

  // Each result's place in the keyboard order, fixed before rendering.
  const flat = groups
    .flatMap((group) => group.items)
    .map((item, position) => ({ ...item, position }));
  const byKey = new Map(flat.map((item) => [item.key, item.position]));
  const positioned = groups.map((group) => ({
    ...group,
    items: group.items.map((item) => ({ ...item, position: byKey.get(item.key) })),
  }));

  return { groups: positioned, flat, term, loading };
}

/**
 * The field and its results, shared by both faces. `open` decides whether the
 * results are shown; the field is always there.
 */
const SearchField = forwardRef(function SearchField(
  { pages, open, onOpenChange, variant, autoFocus = false },
  ref,
) {
  const { t } = useI18n();
  const router = useRouter();
  const input = useRef(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const { groups, flat, term, loading } = useSearch(query, pages);
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);

  function close() {
    setQuery('');
    setActive(0);
    onOpenChange(false);
  }

  function go(item) {
    close();
    input.current?.blur();
    router.push(item.href);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onOpenChange(true);
      setActive((current + 1) % Math.max(flat.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (event.key === 'Enter' && flat[current]) {
      event.preventDefault();
      go(flat[current]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
      input.current?.blur();
    }
  }

  const results = open && (
    <div
      id={listId}
      role="listbox"
      className={cn(
        'max-h-[60vh] overflow-y-auto p-2',
        variant === 'bar' &&
          'absolute start-0 top-full z-50 mt-2 w-[min(32rem,calc(100vw-2rem))] rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-overlay)',
      )}
    >
      {groups.map((group) => (
        <div key={group.key} role="group" aria-label={group.label} className="mb-1 last:mb-0">
          <p className="px-3 pt-2 pb-1 text-xs font-medium tracking-[0.1em] text-(--color-muted) uppercase">
            {group.label}
          </p>
          {group.items.map((item) => {
            const selected = item.position === current;
            const position = item.position;

            return (
              <div
                key={item.key}
                id={`${listId}-${item.key}`}
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                onMouseEnter={() => setActive(position)}
                // Before blur, so the click lands before the list closes.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => go(item)}
                onKeyDown={(event) => event.key === 'Enter' && go(item)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-(--radius-control) px-3 py-2',
                  selected ? 'bg-(--color-surface-selected)' : 'hover:bg-(--color-surface-hover)',
                )}
              >
                <span
                  aria-hidden="true"
                  className="inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-control) bg-(--color-ground) text-(--color-text-2)"
                >
                  <Icon name={item.icon} size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-(--color-text)">
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="block truncate text-xs text-(--color-text-2)">
                      {item.detail}
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      ))}

      {flat.length === 0 && (
        <p className="px-3 py-6 text-center text-sm text-(--color-text-2)">
          {loading
            ? t('search.searching')
            : term
              ? t('search.noResults', { query: term })
              : t('search.hint')}
        </p>
      )}
    </div>
  );

  return (
    <div className={cn('relative', variant === 'bar' ? 'w-full max-w-[22.5rem]' : '')}>
      <div
        className={cn(
          'flex items-center gap-2.5',
          variant === 'bar'
            ? 'h-9 rounded-(--radius-control) border border-(--color-line) bg-(--color-ground) px-3 transition-colors duration-(--duration-fast) focus-within:border-(--color-brand-text) focus-within:bg-(--color-surface) focus-within:ring-2 focus-within:ring-(--color-brand-soft)'
            : 'border-b-2 border-(--color-line-subtle) px-4 focus-within:border-(--color-brand-text)',
        )}
      >
        <Icon
          name="search"
          size={variant === 'bar' ? 16 : 18}
          className="shrink-0 text-(--color-muted)"
        />
        <input
          ref={input}
          autoFocus={autoFocus}
          type="search"
          role="combobox"
          aria-expanded={Boolean(open)}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && flat[current] ? `${listId}-${flat[current].key}` : undefined
          }
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={query}
          onFocus={() => onOpenChange(true)}
          onBlur={() => variant === 'bar' && onOpenChange(false)}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            onOpenChange(true);
          }}
          onKeyDown={onKeyDown}
          // The field's border carries focus; the outline would double it.
          className={cn(
            'focus-on-container min-w-0 flex-1 bg-transparent text-(--color-text) placeholder:text-(--color-muted) [&::-webkit-search-cancel-button]:hidden',
            variant === 'bar' ? 'text-sm' : 'h-14 text-lg',
          )}
        />
        {variant === 'bar' && (
          <kbd className="shrink-0 font-sans text-xs text-(--color-muted)">⌘ K</kbd>
        )}
      </div>

      {results}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/* Faces                                                                       */
/* -------------------------------------------------------------------------- */

/** The field in the top bar. Ctrl/⌘+K focuses it. */
export const TopBarSearch = forwardRef(function TopBarSearch({ pages }, ref) {
  const [open, setOpen] = useState(false);

  return <SearchField ref={ref} pages={pages} open={open} onOpenChange={setOpen} variant="bar" />;
});

/** On a narrow screen: the same field in a dialog, opened from an icon. */
export function SearchDialog({ open, onClose, pages }) {
  const dialog = useRef(null);
  const returnFocus = useRef(null);

  useEffect(() => {
    const element = dialog.current;

    if (!element) return;

    if (open && !element.open) {
      returnFocus.current = document.activeElement;
      element.showModal();
    } else if (!open && element.open) {
      element.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialog}
      onClose={() => {
        returnFocus.current?.focus?.();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
      className="m-0 mx-auto mt-[10vh] w-[min(40rem,calc(100vw-2rem))] max-w-none overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-0 shadow-(--shadow-overlay) backdrop:bg-(--color-text)/30"
    >
      {open && (
        <SearchField
          pages={pages}
          open
          onOpenChange={(next) => !next && onClose()}
          variant="dialog"
          autoFocus
        />
      )}
    </dialog>
  );
}
