import { describe, expect, it } from 'vitest';

import { can, canAll, canAny, hasCostVisibility } from '@/lib/permissions';

describe('can', () => {
  it('grants an ability the user holds', () => {
    expect(can(['orders.view', 'orders.create'], 'orders.create')).toBe(true);
  });

  it('denies an ability the user does not hold', () => {
    expect(can(['orders.view'], 'orders.cancel')).toBe(false);
  });

  it('fails closed on a missing or malformed ability list', () => {
    // A user whose abilities have not loaded yet must be able to do nothing,
    // never everything.
    expect(can(undefined, 'orders.view')).toBe(false);
    expect(can(null, 'orders.view')).toBe(false);
    expect(can('orders.view', 'orders.view')).toBe(false);
    expect(can([], 'orders.view')).toBe(false);
  });

  it('does not match on a prefix', () => {
    // 'orders.view' must never satisfy 'orders.view_margin'.
    expect(can(['orders.view'], 'orders.view_margin')).toBe(false);
  });
});

describe('canAny / canAll', () => {
  it('canAny needs one match', () => {
    expect(canAny(['orders.view'], ['orders.view', 'expenses.view'])).toBe(true);
    expect(canAny(['orders.view'], ['expenses.view'])).toBe(false);
  });

  it('canAll needs every match', () => {
    expect(canAll(['orders.view', 'expenses.view'], ['orders.view', 'expenses.view'])).toBe(true);
    expect(canAll(['orders.view'], ['orders.view', 'expenses.view'])).toBe(false);
  });
});

describe('hasCostVisibility', () => {
  it('is true for a role holding metrics.view_cost', () => {
    expect(hasCostVisibility(['dashboard.view', 'metrics.view_cost'])).toBe(true);
  });

  it('is false for staff', () => {
    // Mirrors the Staff ability list; the backend is the authority, this is
    // only about what gets rendered.
    expect(hasCostVisibility(['dashboard.view', 'orders.view', 'orders.create'])).toBe(false);
  });
});
