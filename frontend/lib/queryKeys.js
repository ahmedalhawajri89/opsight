/**
 * Query keys, in one place.
 *
 * Two reasons this is a module rather than inline strings:
 *
 * 1. **A key must encode every input that changes the result.** Filters are part
 *    of the key, so changing a filter is a cache miss rather than a stale render
 *    under new filters (FRONTEND_ARCHITECTURE.md §3).
 *
 * 2. **Invalidation has to name the same keys.** Confirming an order moves stock
 *    and changes every metric, so it must invalidate orders, inventory AND the
 *    analytics keys. Getting that list wrong shows stale stock to the next
 *    person who looks — and it is far easier to get right when the keys are
 *    listed together.
 */

export const queryKeys = {
  orders: {
    all: ['orders'],
    list: (filters) => ['orders', 'list', filters],
    detail: (id) => ['orders', 'detail', String(id)],
  },
  products: {
    all: ['products'],
    list: (filters) => ['products', 'list', filters],
    detail: (id) => ['products', 'detail', String(id)],
  },
  customers: {
    all: ['customers'],
    list: (filters) => ['customers', 'list', filters],
    detail: (id) => ['customers', 'detail', String(id)],
    orders: (id, filters) => ['customers', 'orders', String(id), filters],
  },
  inventory: {
    all: ['inventory'],
    list: (filters) => ['inventory', 'list', filters],
    lowStock: ['inventory', 'low-stock'],
    movements: (productId, filters) => ['inventory', 'movements', String(productId), filters],
  },
  expenses: {
    all: ['expenses'],
    list: (filters) => ['expenses', 'list', filters],
  },
  analytics: {
    all: ['analytics'],
  },
  dashboard: {
    all: ['dashboard'],
  },
};

/**
 * Everything a stock movement invalidates.
 *
 * Confirming, cancelling, refunding or adjusting all move stock, and every one
 * of them changes what the analytics layer would compute. Listing the set once
 * means a new mutation cannot forget half of it.
 */
export const STOCK_AFFECTING_KEYS = [
  queryKeys.orders.all,
  queryKeys.inventory.all,
  queryKeys.products.all,
  queryKeys.analytics.all,
  queryKeys.dashboard.all,
];
