/**
 * The orders resource. This module owns its endpoint paths; nothing else knows them.
 *
 * State transitions are sub-resource actions, mirroring the API: confirming an
 * order snapshots prices and moves stock, so it is not a field assignment.
 */

import { api, download } from '@/lib/apiClient';

export function listOrders(params) {
  return api.get('/orders', { params });
}

export function exportOrders(params) {
  return download('/orders/export', { params, fallbackName: 'orders.csv' });
}

export function getOrder(id) {
  return api.get(`/orders/${id}`);
}

export function createOrder(body) {
  return api.post('/orders', body);
}

export function updateOrder(id, body) {
  return api.patch(`/orders/${id}`, body);
}

export function deleteOrder(id) {
  return api.delete(`/orders/${id}`);
}

export function addOrderItem(orderId, body) {
  return api.post(`/orders/${orderId}/items`, body);
}

export function removeOrderItem(orderId, itemId) {
  return api.delete(`/orders/${orderId}/items/${itemId}`);
}

export function confirmOrder(id) {
  return api.post(`/orders/${id}/confirm`);
}

export function fulfilOrder(id) {
  return api.post(`/orders/${id}/fulfil`);
}

export function cancelOrder(id, reason) {
  return api.post(`/orders/${id}/cancel`, { reason });
}

export function refundOrder(id, { amount, returnStock, reason }) {
  return api.post(`/orders/${id}/refund`, {
    amount,
    return_stock: returnStock,
    reason: reason || undefined,
  });
}

/** Money received against a committed order (ADR-022). */
export function recordPayment(id, { amount, method, reference }) {
  return api.post(`/orders/${id}/payments`, {
    amount,
    method,
    reference: reference || undefined,
  });
}
