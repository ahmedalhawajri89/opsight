'use client';

import { cn } from '@/lib/cn';

/**
 * What the filtered set adds up to, printed above the table it totals.
 *
 * WHY A LIST SCREEN NEEDS ONE. Before this, the orders screen showed
 * twenty-five rows out of two thousand and said nothing about the set the
 * reader had just filtered down to. Someone asking "how did November go" got
 * a page of rows and had to add them up by eye — on an operations tool whose
 * whole claim is that it does the adding.
 *
 * EVERY FIGURE COMES FROM THE SERVER, over the whole filtered set. Summing
 * the rows in the browser would total the PAGE, and a page total presented as
 * a set total is wrong by however many pages there are — silently, and most
 * wrongly on the largest sets, where it matters most. The endpoint returns
 * these alongside the page (OrderController::totals).
 *
 * IT LIVES INSIDE THE TABLE'S CARD, not in a card of its own. A band that
 * floats above the table reads as a separate statement about the business;
 * inside the same edge it reads as the table's own total, which is exactly
 * what it is — and what keeps it honest when the filters change.
 *
 * NOTHING IS SHOWN WHILE IT IS STILL BEING COUNTED. A zero during a fetch is
 * not "nothing yet", it is a figure, and a reader who glances at the moment
 * it renders has been told the business did no trade. The placeholders hold
 * the exact height of the figures so the table beneath never jumps.
 *
 * A figure the reader's role may not see is simply absent — the caller omits
 * the item rather than passing a zero, the same way the server omits the key
 * and the table omits the column.
 */
export function ResultSummary({ items, loading = false, className }) {
  if (!items?.length) return null;

  return (
    <div
      className={cn(
        'flex flex-wrap items-stretch gap-x-8 gap-y-4 border-b border-(--color-line) px-4 py-4 sm:px-5',
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.key} className="min-w-28">
          {loading ? (
            // Matched to the figure's own line box, so nothing shifts when
            // the number arrives.
            <div className="skeleton h-7 w-28 rounded-(--radius-control)" />
          ) : (
            <p
              className={cn(
                'tabular text-xl leading-7 font-semibold',
                item.tone === 'accent' ? 'text-(--color-brand-text)' : 'text-(--color-text)',
              )}
            >
              {item.value}
            </p>
          )}

          <p className="mt-1 text-xs text-(--color-text-2)">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
