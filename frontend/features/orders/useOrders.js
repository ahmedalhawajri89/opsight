'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { STOCK_AFFECTING_KEYS, queryKeys } from '@/lib/queryKeys';
import * as ordersService from '@/services/orders';

/**
 * Orders — reads and lifecycle mutations.
 *
 * Every hook returns the same contract the architecture specifies:
 * `{ data, isLoading, isError, error, refetch }` (FRONTEND_ARCHITECTURE.md §3).
 */

export function useOrders(filters) {
  const query = useQuery({
    queryKey: queryKeys.orders.list(filters),
    queryFn: () => ordersService.listOrders(filters),
    // Keep the previous page visible while the next one loads, so the table
    // does not flash empty on every page change.
    placeholderData: (previous) => previous,
  });

  return {
    orders: query.data?.data ?? [],
    meta: query.data?.meta,
    ...query,
  };
}

export function useOrder(id) {
  const query = useQuery({
    queryKey: queryKeys.orders.detail(id),
    queryFn: () => ordersService.getOrder(id),
    enabled: Boolean(id),
  });

  return { order: query.data?.data, ...query };
}

/**
 * The lifecycle mutations.
 *
 * All of them invalidate the full stock-affecting set rather than just orders:
 * confirming decrements stock, cancelling returns it, and both change every
 * figure the analytics layer would compute. Invalidating only `orders` would
 * leave the inventory screen showing a number that is no longer true.
 */
export function useOrderActions(orderId) {
  const queryClient = useQueryClient();

  function invalidateAll() {
    for (const key of STOCK_AFFECTING_KEYS) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  }

  const confirm = useMutation({
    mutationFn: () => ordersService.confirmOrder(orderId),
    onSuccess: invalidateAll,
  });

  const fulfil = useMutation({
    mutationFn: () => ordersService.fulfilOrder(orderId),
    onSuccess: invalidateAll,
  });

  const cancel = useMutation({
    mutationFn: (reason) => ordersService.cancelOrder(orderId, reason),
    onSuccess: invalidateAll,
  });

  const refund = useMutation({
    mutationFn: (payload) => ordersService.refundOrder(orderId, payload),
    onSuccess: invalidateAll,
  });

  const pay = useMutation({
    mutationFn: (payload) => ordersService.recordPayment(orderId, payload),
    onSuccess: invalidateAll,
  });

  return { confirm, fulfil, cancel, refund, pay };
}

export function useOrderDraft() {
  const queryClient = useQueryClient();

  const create = useMutation({
    mutationFn: (body) => ordersService.createOrder(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
  });

  const addItem = useMutation({
    mutationFn: ({ orderId, ...body }) => ordersService.addOrderItem(orderId, body),
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) });
    },
  });

  const removeItem = useMutation({
    mutationFn: ({ orderId, itemId }) => ordersService.removeOrderItem(orderId, itemId),
    onSuccess: (_, { orderId }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders.detail(orderId) });
    },
  });

  return { create, addItem, removeItem };
}
