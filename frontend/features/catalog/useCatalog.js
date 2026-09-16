'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STOCK_AFFECTING_KEYS, queryKeys } from '@/lib/queryKeys';
import * as catalog from '@/services/catalog';

/**
 * Products, customers, inventory and expenses.
 *
 * Each read hook returns `{ <items>, meta, ...query }`, so a screen destructures
 * the rows it wants and passes `meta` straight to Pagination.
 */

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

export function useProducts(filters) {
  const query = useQuery({
    queryKey: queryKeys.products.list(filters),
    queryFn: () => catalog.listProducts(filters),
    placeholderData: (previous) => previous,
  });

  return { products: query.data?.data ?? [], meta: query.data?.meta, ...query };
}

export function useProductActions() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.products.all });

  return {
    create: useMutation({
      mutationFn: (body) => catalog.createProduct(body),
      onSuccess: () => {
        // A new product creates an inventory row, so both lists change.
        invalidate();
        queryClient.invalidateQueries({ queryKey: queryKeys.inventory.all });
      },
    }),
    update: useMutation({
      mutationFn: ({ id, ...body }) => catalog.updateProduct(id, body),
      /*
       * Only products and analytics are invalidated, NOT orders: a price or
       * cost change affects future orders only. Past order lines hold their own
       * snapshots and are untouched, so refetching them would be pure waste.
       */
      onSuccess: () => {
        invalidate();
        queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
      },
    }),
    setActive: useMutation({
      mutationFn: ({ id, active }) => catalog.setProductActive(id, active),
      onSuccess: invalidate,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

export function useCustomers(filters) {
  const query = useQuery({
    queryKey: queryKeys.customers.list(filters),
    queryFn: () => catalog.listCustomers(filters),
    placeholderData: (previous) => previous,
  });

  return { customers: query.data?.data ?? [], meta: query.data?.meta, ...query };
}

export function useCustomer(id) {
  const query = useQuery({
    queryKey: queryKeys.customers.detail(id),
    queryFn: () => catalog.getCustomer(id),
    enabled: Boolean(id),
  });

  return { customer: query.data?.data, ...query };
}

export function useCustomerOrders(id, filters) {
  const query = useQuery({
    queryKey: queryKeys.customers.orders(id, filters),
    queryFn: () => catalog.getCustomerOrders(id, filters),
    enabled: Boolean(id),
  });

  return { orders: query.data?.data ?? [], meta: query.data?.meta, ...query };
}

export function useCustomerActions() {
  const queryClient = useQueryClient();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });

  return {
    create: useMutation({ mutationFn: catalog.createCustomer, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, ...body }) => catalog.updateCustomer(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: catalog.deleteCustomer, onSuccess: invalidate }),
  };
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

export function useInventory(filters) {
  const query = useQuery({
    queryKey: queryKeys.inventory.list(filters),
    queryFn: () => catalog.listInventory(filters),
    placeholderData: (previous) => previous,
  });

  return { items: query.data?.data ?? [], meta: query.data?.meta, ...query };
}

export function useMovements(productId, filters) {
  const query = useQuery({
    queryKey: queryKeys.inventory.movements(productId, filters),
    queryFn: () => catalog.listMovements(productId, filters),
    enabled: Boolean(productId),
  });

  return { movements: query.data?.data ?? [], meta: query.data?.meta, ...query };
}

export function useStockActions() {
  const queryClient = useQueryClient();

  // A stock movement changes inventory, the product list's stock column, and
  // every figure analytics would compute from it.
  const invalidate = () => {
    for (const key of STOCK_AFFECTING_KEYS) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  };

  return {
    adjust: useMutation({
      mutationFn: ({ productId, ...body }) => catalog.adjustStock(productId, body),
      onSuccess: invalidate,
    }),
    restock: useMutation({
      mutationFn: ({ productId, ...body }) => catalog.restockProduct(productId, body),
      onSuccess: invalidate,
    }),
  };
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                    */
/* -------------------------------------------------------------------------- */

export function useExpenses(filters) {
  const query = useQuery({
    queryKey: queryKeys.expenses.list(filters),
    queryFn: () => catalog.listExpenses(filters),
    placeholderData: (previous) => previous,
  });

  return { expenses: query.data?.data ?? [], meta: query.data?.meta, ...query };
}

export function useExpenseActions() {
  const queryClient = useQueryClient();

  // Expenses feed operating profit, so analytics changes with them.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.expenses.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.analytics.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
  };

  return {
    create: useMutation({ mutationFn: catalog.createExpense, onSuccess: invalidate }),
    update: useMutation({
      mutationFn: ({ id, ...body }) => catalog.updateExpense(id, body),
      onSuccess: invalidate,
    }),
    remove: useMutation({ mutationFn: catalog.deleteExpense, onSuccess: invalidate }),
  };
}
