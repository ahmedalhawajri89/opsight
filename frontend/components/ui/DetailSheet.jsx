'use client';

import { Dialog } from '@/components/ui/Dialog';
import { cn } from '@/lib/cn';

/**
 * One record, in a panel that slides in from the side.
 *
 * THE PROJECT'S ONE WAY OF SHOWING A RECORD WITHOUT LEAVING THE LIST. An
 * expense, a stock line — and whatever comes next — open in the same panel
 * with the same anatomy, so a reader who has learnt one has learnt them all:
 *
 *   header   what it is, and the one line that places it
 *   hero     the figure the record exists for, large
 *   sections facts as label/value pairs, then anything longer
 *   footer   what can be done with it
 *
 * Built on Dialog's side placement, so focus is trapped and returned, Escape
 * and the backdrop close it, and it slides in with the motion every dialog
 * in the application shares (globals.css).
 */
export function DetailSheet({ open, onClose, title, subtitle, hero, footer, children }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      description={subtitle}
      placement="side"
      size="sm"
      footer={footer}
    >
      <div className="space-y-6">
        {hero}
        {children}
      </div>
    </Dialog>
  );
}

const TONES = {
  neutral: 'bg-(--color-surface-selected)',
  brand: 'bg-(--color-brand-soft)',
  success: 'bg-(--color-success-soft)',
  warning: 'bg-(--color-warning-soft)',
  danger: 'bg-(--color-danger-soft)',
};

/**
 * The record's headline figure. `badge` sits beside the label — a status, a
 * category — and `note` under the figure for its one qualification.
 */
export function DetailHero({ label, value, badge, note, tone = 'neutral' }) {
  return (
    <div className={cn('rounded-xl p-4', TONES[tone] ?? TONES.neutral)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-(--color-text-2)">{label}</p>
        {badge}
      </div>
      <p className="tabular mt-1.5 text-2xl font-semibold text-(--color-text)">{value}</p>
      {note ? <p className="mt-1 text-xs text-(--color-text-2)">{note}</p> : null}
    </div>
  );
}

export function DetailSection({ title, action, children }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold tracking-(--tracking-eyebrow) text-(--color-muted) uppercase">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/**
 * Facts as label/value rows. A missing value reads as an em dash rather than
 * leaving the row out, so the same record always shows the same shape and an
 * absent supplier is visibly absent.
 */
export function DetailList({ items }) {
  return (
    <dl className="divide-y divide-(--border-subtle) rounded-xl border border-(--border-subtle)">
      {items.map(({ label, value }) => (
        <div key={label} className="flex items-start justify-between gap-4 px-3.5 py-2.5 text-sm">
          <dt className="shrink-0 text-(--color-text-2)">{label}</dt>
          <dd className="min-w-0 text-end break-words text-(--color-text)" dir="auto">
            {value === null || value === undefined || value === '' ? (
              <span className="text-(--color-muted)">—</span>
            ) : (
              value
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
