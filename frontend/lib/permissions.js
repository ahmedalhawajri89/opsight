/**
 * Ability checks for the UI.
 *
 * IMPORTANT: these decide what to *render*. They are not a security boundary.
 * The server withholds the data regardless, and is assumed to be the only
 * authority (docs/architecture/SECURITY.md §2.2).
 *
 * There is deliberately no copy of the role → ability table here. The list
 * arrives from GET /me, so the backend registry stays the single source of
 * truth and the two cannot drift.
 */

export function can(abilities, ability) {
  if (!Array.isArray(abilities)) return false;

  return abilities.includes(ability);
}

export function canAny(abilities, required) {
  return required.some((ability) => can(abilities, ability));
}

export function canAll(abilities, required) {
  return required.every((ability) => can(abilities, ability));
}

/**
 * Cost, margin and profit figures are withheld from Staff server-side, so the
 * keys are absent from the payload entirely rather than null. Components must
 * therefore tolerate a missing key — this helper makes that explicit at the
 * call site rather than leaving it to an accidental `?.`.
 */
export function hasCostVisibility(abilities) {
  return can(abilities, 'metrics.view_cost');
}
