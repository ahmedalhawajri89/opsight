'use client';

import { useAuth } from './AuthProvider';

/**
 * Renders children only when the current user holds the ability.
 *
 * Usage:
 *   <Can ability="orders.cancel">
 *     <Button variant="danger">Cancel order</Button>
 *   </Can>
 *
 * Withheld children are absent from the DOM, not hidden with CSS. Hiding would
 * still ship the markup — and for anything carrying a value, still ship the
 * value.
 *
 * This governs rendering only. The server is the authority (SECURITY.md §2.2).
 */
export function Can({ ability, anyOf, children, fallback = null }) {
  const { can } = useAuth();

  const allowed = anyOf ? anyOf.some((item) => can(item)) : can(ability);

  return allowed ? children : fallback;
}
