/**
 * How the product addresses a person.
 *
 * WHY THESE MOVED HERE. Both were private helpers — `initials` inside
 * `AppShell`, `greeting` inside the dashboard page — which was right while
 * each had one caller. The sign-up form now shows a reader the account chip
 * and the greeting they are about to create, and a preview that imitates
 * those rules instead of running them is a promise the product can break
 * without anyone noticing: change the greeting to use a full name, and the
 * preview goes on cheerfully showing a first name.
 *
 * So the preview calls the same functions the real screens call. If they
 * change, it changes.
 */

/**
 * The two letters an avatar carries: the first letter of the first two words.
 *
 * Falls back to a middle dot rather than an empty circle, because a chip with
 * nothing in it reads as a failed image.
 *
 * @param {string} name
 * @returns {string}
 */
export function initials(name = '') {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || '·'
  );
}

/**
 * "Good morning, Ahmed" — by the reader's own clock, with their first name.
 *
 * The reader's local hour rather than the business timezone: a greeting is
 * about the person reading, and "good evening" at their breakfast is wrong
 * whatever the business's books say.
 *
 * @param {(key: string, values?: Record<string, unknown>) => string} t
 * @param {string} [name]
 * @returns {string}
 */
export function greeting(t, name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const first = String(name ?? '')
    .trim()
    .split(/\s+/)[0];

  return first
    ? t(`dashboard.greeting.${part}`, { name: first })
    : t(`dashboard.greeting.${part}Anonymous`);
}
