'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';

import { Icon } from '@/components/ui/Icon';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
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
 * Opened by the search field in the top bar or by Ctrl/⌘+K. Arrow keys move,
 * Enter opens, Escape closes and returns focus to where it was.
 */
const MIN_QUERY = 2;
const LIMIT = 5;

export function useSearchShortcut(onOpen) {
  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpen();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [onOpen]);
}

export function GlobalSearch({ open, onClose, pages }) {
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
      className="m-0 mx-auto mt-[12vh] w-[min(40rem,calc(100vw-2rem))] max-w-none overflow-visible bg-transparent p-0 backdrop:bg-(--color-text)/30 backdrop:backdrop-blur-[2px]"
    >
      {/* Mounted only while open, so each opening starts from an empty query. */}
      {open && <SearchPanel pages={pages} onClose={onClose} />}
    </dialog>
  );
}

function SearchPanel({ pages, onClose }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 200);

    return () => clearTimeout(timer);
  }, [query]);

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
        href: `/customers?filter[search]=${encodeURIComponent(customer.name)}`,
        icon: 'customers',
        title: customer.name,
        detail: customer.email ?? customer.company ?? '',
      })),
    },
    {
      key: 'products',
      label: t('search.groups.products'),
      items: (products.data ?? []).map((product) => ({
        key: `product-${product.id}`,
        href: `/products?filter[search]=${encodeURIComponent(product.sku)}`,
        icon: 'products',
        title: product.name,
        detail: product.sku,
      })),
    },
  ].filter((group) => group.items.length > 0);

  const flat = groups.flatMap((group) => group.items);
  const loading =
    Boolean(term) && (orders.isFetching || customers.isFetching || products.isFetching);
  const current = Math.min(active, Math.max(flat.length - 1, 0));

  function go(item) {
    onClose();
    router.push(item.href);
  }

  function onKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current + 1) % Math.max(flat.length, 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current - 1 + flat.length) % Math.max(flat.length, 1));
    } else if (event.key === 'Enter' && flat[current]) {
      event.preventDefault();
      go(flat[current]);
    }
  }

  let index = -1;

  return (
    <div className="overflow-hidden rounded-(--radius-lg) border border-(--color-line) bg-(--color-surface-raised) shadow-(--shadow-overlay)">
      <div className="flex items-center gap-3 border-b border-(--color-line-subtle) px-4">
        <Icon name="search" size={18} className="shrink-0 text-(--color-text-subtle)" />
        <input
          // A dialog opened on purpose: focusing its only field is expected.
          autoFocus
          type="search"
          role="combobox"
          aria-expanded={flat.length > 0}
          aria-controls="global-search-results"
          aria-activedescendant={flat[current] ? `search-${flat[current].key}` : undefined}
          aria-label={t('search.label')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          className="h-14 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-(--color-text) placeholder:text-(--color-text-subtle) focus:outline-none"
        />
        <kbd className="shrink-0 rounded-(--radius-sm) border border-(--color-line) px-1.5 py-0.5 text-[0.6875rem] text-(--color-text-subtle)">
          Esc
        </kbd>
      </div>

      <div id="global-search-results" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
        {groups.map((group) => (
          <div key={group.key} role="group" aria-label={group.label} className="mb-1 last:mb-0">
            <p className="px-3 pt-2 pb-1 text-[0.6875rem] font-semibold tracking-[0.06em] text-(--color-text-subtle) uppercase">
              {group.label}
            </p>
            {group.items.map((item) => {
              index += 1;
              const selected = index === current;
              const position = index;

              return (
                <div
                  key={item.key}
                  id={`search-${item.key}`}
                  role="option"
                  aria-selected={selected}
                  tabIndex={-1}
                  onMouseEnter={() => setActive(position)}
                  onClick={() => go(item)}
                  onKeyDown={(event) => event.key === 'Enter' && go(item)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-(--radius-md) px-3 py-2.5',
                    selected ? 'bg-(--color-surface-selected)' : 'hover:bg-(--color-surface-hover)',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-md) bg-(--color-surface-sunken) text-(--color-text-muted)"
                  >
                    <Icon name={item.icon} size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-(--color-text)">
                      {item.title}
                    </span>
                    {item.detail && (
                      <span className="block truncate text-xs text-(--color-text-muted)">
                        {item.detail}
                      </span>
                    )}
                  </span>
                  {selected && (
                    <Icon
                      name="arrowRight"
                      size={14}
                      className="shrink-0 text-(--color-text-subtle) rtl:-scale-x-100"
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {flat.length === 0 && (
          <p className="px-3 py-8 text-center text-sm text-(--color-text-muted)">
            {loading
              ? t('search.searching')
              : term
                ? t('search.noResults', { query: term })
                : t('search.hint')}
          </p>
        )}
      </div>
    </div>
  );
}

function useSource(term, allowed, key, fetcher) {
  return useQuery({
    queryKey: ['search', key, term],
    queryFn: async () => (await fetcher()).data ?? [],
    enabled: allowed && term !== '',
    staleTime: 30_000,
  });
}
