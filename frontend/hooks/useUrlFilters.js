'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Filter, sort and pagination state, held in the URL.
 *
 * Why the URL rather than component state: a filtered view is then shareable,
 * survives a refresh, works with the back button, and is reproducible in a bug
 * report. Component state does none of those things
 * (FRONTEND_ARCHITECTURE.md §7).
 *
 * The URL is the single source of truth. This hook parses it, validates against
 * the endpoint's allowlist, and writes changes back.
 *
 * USAGE NOTE: define the config object at module scope, not inline in the
 * component —
 *
 *   const ORDER_FILTERS = { defaults: {...}, allowed: [...], sortable: [...] };
 *   const { filters, setFilters } = useUrlFilters(ORDER_FILTERS);
 *
 * An inline literal is a new object every render, which defeats the
 * memoisation below. Every dependency array here is a list of plain
 * identifiers, so a stable config in means stable output out.
 */

const NO_DEFAULTS = {};
const NO_KEYS = [];

/** Keys that control presentation rather than narrowing the result set. */
const CONTROL_KEYS = ['page', 'per_page', 'sort'];

export function useUrlFilters({
  defaults = NO_DEFAULTS,
  allowed = NO_KEYS,
  sortable = NO_KEYS,
} = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // A plain string, so the dependency below is a simple expression.
  const search = searchParams.toString();

  const filters = useMemo(() => {
    const params = new URLSearchParams(search);
    const parsed = { ...defaults };

    for (const key of allowed) {
      const value = params.get(key);

      if (value !== null && value !== '') parsed[key] = value;
    }

    // Numeric params come back as numbers, so callers never have to cast.
    if (parsed.page !== undefined) parsed.page = Number(parsed.page) || 1;
    if (parsed.per_page !== undefined) parsed.per_page = Number(parsed.per_page) || 25;

    /*
     * An unknown sort field falls back to the default rather than being
     * forwarded. The server rejects it with a 422 by design, but firing a
     * request that is certain to fail — because someone hand-edited the URL —
     * leaves the user staring at an error instead of a usable page.
     */
    if (parsed.sort) {
      const field = parsed.sort.startsWith('-') ? parsed.sort.slice(1) : parsed.sort;

      if (sortable.length > 0 && !sortable.includes(field)) parsed.sort = defaults.sort;
    }

    return parsed;
  }, [search, defaults, allowed, sortable]);

  const write = useCallback(
    (next) => {
      const params = new URLSearchParams();

      for (const [key, value] of Object.entries(next)) {
        if (value === undefined || value === null || value === '') continue;

        // Defaults are omitted, keeping a shared URL short and readable.
        if (String(defaults[key]) === String(value)) continue;

        params.set(key, String(value));
      }

      const query = params.toString();

      // replace, not push: typing in a search box must not fill the history
      // stack with a back-button trail of every keystroke.
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [router, pathname, defaults],
  );

  /**
   * Change one or more filters.
   *
   * Changing any filter resets to page 1 — otherwise narrowing a result set
   * strands the user on an empty page 7, which reads as a bug.
   */
  const setFilters = useCallback(
    (changes) => {
      const resetsPage = Object.keys(changes).some((key) => key !== 'page');

      write({ ...filters, ...changes, ...(resetsPage ? { page: 1 } : {}) });
    },
    [filters, write],
  );

  const setPage = useCallback((page) => write({ ...filters, page }), [filters, write]);

  const setSort = useCallback((sort) => write({ ...filters, sort, page: 1 }), [filters, write]);

  const clearFilters = useCallback(() => write(defaults), [write, defaults]);

  /** Filters that differ from their default — what the UI calls "active". */
  const activeKeys = useMemo(() => {
    return Object.keys(filters).filter((key) => {
      if (CONTROL_KEYS.includes(key)) return false;

      const value = filters[key];

      return value !== undefined && value !== '' && String(value) !== String(defaults[key]);
    });
  }, [filters, defaults]);

  return { filters, setFilters, setPage, setSort, clearFilters, activeKeys };
}
