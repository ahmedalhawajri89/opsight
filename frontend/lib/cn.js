import clsx from 'clsx';

/**
 * Conditional class names.
 *
 * A thin alias over clsx so components read consistently and the dependency is
 * swappable in one place. No tailwind-merge: it costs bundle size to solve a
 * problem that disciplined variant maps do not create.
 */
export function cn(...inputs) {
  return clsx(inputs);
}
