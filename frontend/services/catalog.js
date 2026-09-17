/**
 * Products, customers, inventory and expenses.
 *
 * Grouped in one module because each is a plain CRUD resource with no
 * transitions of its own — splitting them into four near-identical files would
 * be structure without substance. Orders have a lifecycle, so they keep their
 * own module.
 */

import { api, download } from '@/lib/apiClient';

/* -------------------------------------------------------------------------- */
/* Products                                                                    */
/* -------------------------------------------------------------------------- */

export function listProducts(params) {
  return api.get('/products', { params });
}

export function getProduct(id) {
  return api.get(`/products/${id}`);
}

export function createProduct(body) {
  return api.post('/products', body);
}

export function updateProduct(id, body) {
  return api.patch(`/products/${id}`, body);
}

export function setProductActive(id, active) {
  return api.post(`/products/${id}/${active ? 'activate' : 'deactivate'}`);
}

/*
 * Exports take the SAME params object the list call takes, deliberately. The
 * server runs both through one query definition, and passing the screen's live
 * filters straight through is what makes "export what I am looking at" true
 * rather than approximately true.
 */
export function exportProducts(params) {
  return download('/products/export', { params, fallbackName: 'products.csv' });
}

/* -------------------------------------------------------------------------- */
/* Customers                                                                   */
/* -------------------------------------------------------------------------- */

export function listCustomers(params) {
  return api.get('/customers', { params });
}

export function getCustomer(id) {
  return api.get(`/customers/${id}`);
}

export function getCustomerOrders(id, params) {
  return api.get(`/customers/${id}/orders`, { params });
}

export function createCustomer(body) {
  return api.post('/customers', body);
}

export function updateCustomer(id, body) {
  return api.patch(`/customers/${id}`, body);
}

export function exportCustomers(params) {
  return download('/customers/export', { params, fallbackName: 'customers.csv' });
}

export function deleteCustomer(id) {
  return api.delete(`/customers/${id}`);
}

/* -------------------------------------------------------------------------- */
/* Inventory                                                                   */
/* -------------------------------------------------------------------------- */

export function listInventory(params) {
  return api.get('/inventory', { params });
}

export function listLowStock(params) {
  return api.get('/inventory/low-stock', { params });
}

export function listMovements(productId, params) {
  return api.get(`/inventory/${productId}/movements`, { params });
}

export function exportInventory(params) {
  return download('/inventory/export', { params, fallbackName: 'inventory.csv' });
}

export function adjustStock(productId, body) {
  return api.post(`/inventory/${productId}/adjust`, body);
}

export function restockProduct(productId, body) {
  return api.post(`/inventory/${productId}/restock`, body);
}

/* -------------------------------------------------------------------------- */
/* Expenses                                                                    */
/* -------------------------------------------------------------------------- */

export function listExpenses(params) {
  return api.get('/expenses', { params });
}

export function exportExpenses(params) {
  return download('/expenses/export', { params, fallbackName: 'expenses.csv' });
}

export function createExpense(body) {
  return api.post('/expenses', body);
}

export function updateExpense(id, body) {
  return api.patch(`/expenses/${id}`, body);
}

export function deleteExpense(id) {
  return api.delete(`/expenses/${id}`);
}
