'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/layout/PageHeader';
import { cn } from '@/lib/cn';

/**
 * The insights feed.
 *
 * Every line is a sentence and a route to the evidence behind it. A dashboard
 * that asserts "gross margin fell" without letting the reader check it is
 * asking to be believed, and the first time a reader finds an insight was an
 * artefact of a partial period they stop reading the whole feed.
 *
 * Severity is a KIND, not a rank. `action` and `opportunity` are not degrees
 * of badness, so they are not on a red-to-green ramp: each carries a word as
 * well as a colour, because a colour alone is lost to a colour-blind reader, a
 * greyscale print and a screenshot in a report (UI_UX_DIRECTION.md §6).
 */
const SEVERITY = {
  warning: { tone: 'warning', label: 'Warning' },
  action: { tone: 'accent', label: 'Action' },
  positive: { tone: 'positive', label: 'Good news' },
  opportunity: { tone: 'accent', label: 'Opportunity' },
  data_quality: { tone: 'neutral', label: 'Data quality' },
};

export function InsightFeed({ insights = [], suppressed = null, loading = false, className }) {
  return (
    <Card
      title="What changed"
      description="Deterministic rules over the figures on this page"
      className={className}
    >
      {loading ? (
        <ul className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <li key={row} className="skeleton h-10 rounded-[--radius-sm]" />
          ))}
        </ul>
      ) : insights.length > 0 ? (
        <ul className="divide-y divide-[--color-line]">
          {insights.map((insight) => (
            <InsightRow key={insight.id} insight={insight} />
          ))}
        </ul>
      ) : (
        <EmptyFeed suppressed={suppressed} />
      )}
    </Card>
  );
}

function InsightRow({ insight }) {
  const severity = SEVERITY[insight.severity] ?? SEVERITY.warning;
  const href = linkFor(insight.link);

  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5 first:pt-0 last:pb-0">
      <Badge tone={severity.tone} className="mt-0.5 shrink-0">
        {severity.label}
      </Badge>

      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-[--color-text]">{insight.title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-[--color-text-muted]">
          {insight.message}
        </p>
      </div>

      {href && (
        <Link
          href={href}
          className="mt-0.5 shrink-0 text-[0.8125rem] text-[--color-accent-text] hover:underline"
        >
          {/*
            The link carries the period the insight was computed for, so the
            screen it opens shows the figures the sentence quoted rather than
            today's. A "check this" that lands on different numbers is worse
            than no link at all.
          */}
          Check the figures
        </Link>
      )}
    </li>
  );
}

/**
 * An empty feed, explained.
 *
 * "Nothing is wrong" and "the rules were not allowed to run" are completely
 * different statements, and blank space says the first. On the first of the
 * month — when the default rolling window always includes today — the second
 * is what is actually true, and it is the state most readers will meet most
 * often.
 */
function EmptyFeed({ suppressed }) {
  if (suppressed?.message) {
    return (
      <div
        className={cn('rounded-[--radius-sm] border border-dashed border-[--color-line]', 'p-3')}
      >
        <p className="text-sm font-medium text-[--color-text]">
          {suppressed.reason === 'partial_period'
            ? 'Held back until this period finishes'
            : 'Held back on this period'}
        </p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-[--color-text-muted]">
          {suppressed.message}
        </p>
      </div>
    );
  }

  return (
    <p className="text-sm text-[--color-text-muted]">
      Nothing in this period crossed a reporting threshold.
    </p>
  );
}

/**
 * Turns a rule's link payload into a route.
 *
 * Point-in-time rules link to an operational screen (`href`), period rules to
 * analytics with their own dates attached. Both shapes are produced by the
 * server, so the rule decides where its evidence lives rather than this
 * component guessing from the id.
 */
function linkFor(link) {
  if (!link || typeof link !== 'object') return null;

  const { href, ...params } = link;

  const query = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    query.append(key, String(value));
  }

  const search = query.toString();

  /*
   * No destination and no period means no link.
   *
   * Falling back to a bare /analytics would send the reader to TODAY's
   * figures, which are not the figures the sentence quoted — the exact
   * mismatch this component's link is meant to prevent. A missing link is
   * better than one that quietly changes the subject.
   */
  if (!href && !search) return null;

  const target = href ?? '/analytics';

  return search ? `${target}?${search}` : target;
}
