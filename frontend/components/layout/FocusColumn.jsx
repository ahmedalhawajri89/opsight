import { cn } from '@/lib/cn';

/**
 * Layout template 1 of 3: the focus page.
 *
 * One column, 420–560px, centred, for a screen with a single task and nothing
 * to navigate: signing in, a settings form, a wizard step. The other two
 * templates are the application shell (sidebar + page header + 12 columns) and
 * list/detail (the list at the start edge, the record at the end edge).
 *
 * The width is the point. A form wider than this makes the eye travel from the
 * end of one field to the start of the next, and a form narrower than this
 * wraps its own labels.
 */
export function FocusColumn({ children, className }) {
  return <div className={cn('mx-auto w-full max-w-110 min-w-0', className)}>{children}</div>;
}
