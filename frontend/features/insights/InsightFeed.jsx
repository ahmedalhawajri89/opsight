'use client';

import Link from 'next/link';

import { Card } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/cn';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Key changes — the insights feed.
 *
 * Every line is a sentence and a route to the evidence behind it. A dashboard
 * that asserts "gross margin fell" without letting the reader check it is
 * asking to be believed, and the first time a reader finds an insight was an
 * artefact of a partial period they stop reading the whole feed.
 *
 * These are DETERMINISTIC rules over the figures (METRICS.md §4), and the panel
 * says so in its description. Nothing here is generated, scored or inferred.
 *
 * Severity is a KIND, not a rank. `action` and `opportunity` are not degrees of
 * badness, so they are not on a red-to-green ramp. Each carries three signals —
 * an icon shape, a word, and a tone — so no reader depends on colour to tell a
 * warning from good news (UI_UX_DIRECTION.md §6).
 */
const SEVERITY = {
  warning: {
    label: 'insights.severity.warning',
    icon: 'alert',
    tile: 'bg-(--color-warning-subtle) text-(--color-warning)',
    text: 'text-(--color-warning)',
  },
  action: {
    label: 'insights.severity.action',
    icon: 'bolt',
    tile: 'bg-(--color-accent-subtle) text-(--color-accent-text)',
    text: 'text-(--color-accent-text)',
  },
  positive: {
    label: 'insights.severity.positive',
    icon: 'check',
    tile: 'bg-(--color-positive-subtle) text-(--color-positive)',
    text: 'text-(--color-positive)',
  },
  opportunity: {
    label: 'insights.severity.opportunity',
    icon: 'spark',
    tile: 'bg-(--color-accent-subtle) text-(--color-accent-text)',
    text: 'text-(--color-accent-text)',
  },
  data_quality: {
    label: 'insights.severity.data_quality',
    icon: 'database',
    tile: 'bg-(--color-surface-hover) text-(--color-text-muted)',
    text: 'text-(--color-text-muted)',
  },
};

export function InsightFeed({ insights = [], suppressed = null, loading = false, className }) {
  const { t } = useI18n();

  return (
    <Card
      title={t('insights.title')}
      description={t('insights.description')}
      className={cn('flex flex-col', className)}
      bodyClassName="flex-1"
    >
      {loading ? (
        <ul className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((row) => (
            <li key={row} className="flex gap-3">
              <div className="skeleton size-8 shrink-0 rounded-(--radius-md)" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-3.5 w-2/3 rounded-(--radius-sm)" />
                <div className="skeleton h-3 w-full rounded-(--radius-sm)" />
              </div>
            </li>
          ))}
        </ul>
      ) : insights.length > 0 ? (
        <ul className="-my-3 divide-y divide-(--color-line-subtle)">
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
  const { t } = useI18n();
  const severity = SEVERITY[insight.severity] ?? SEVERITY.warning;
  const target = linkFor(insight.link);

  return (
    <li className="flex gap-3 py-3">
      <span
        aria-hidden="true"
        className={cn(
          'inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-md)',
          severity.tile,
        )}
      >
        <Icon name={severity.icon} size={16} />
      </span>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'text-[0.6875rem] font-semibold tracking-[0.06em] uppercase',
            severity.text,
          )}
        >
          {t(severity.label)}
        </p>
        <p className="mt-0.5 text-sm font-medium text-(--color-text)">{insight.title}</p>
        <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-(--color-text-muted)">
          {insight.message}
        </p>

        {target && (
          <Link
            href={target.href}
            className="group mt-1.5 inline-flex items-center gap-1 text-[0.8125rem] font-medium text-(--color-accent-text) hover:underline"
          >
            {/*
              The link carries the period the insight was computed for, so the
              screen it opens shows the figures the sentence quoted rather than
              today's. A "check this" that lands on different numbers is worse
              than no link at all.
            */}
            {t(target.label)}
            <Icon
              name="arrowRight"
              size={14}
              className="transition-transform duration-150 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
            />
          </Link>
        )}
      </div>
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
  const { t } = useI18n();

  if (suppressed?.message) {
    return (
      <div className="flex gap-3 rounded-(--radius-md) bg-(--color-surface-sunken) p-3.5">
        <Icon name="clock" className="mt-0.5 shrink-0 text-(--color-text-subtle)" />
        <div>
          <p className="text-[0.8125rem] font-medium text-(--color-text)">
            {suppressed.reason === 'partial_period'
              ? t('insights.heldBackPartial')
              : t('insights.heldBack')}
          </p>
          <p className="mt-1 text-[0.8125rem] leading-relaxed text-(--color-text-muted)">
            {suppressed.message}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 rounded-(--radius-md) bg-(--color-surface-sunken) p-3.5">
      <Icon name="check" className="mt-0.5 shrink-0 text-(--color-positive)" />
      <p className="text-[0.8125rem] text-(--color-text-muted)">{t('insights.nothingCrossed')}</p>
    </div>
  );
}

/*
 * Where a point-in-time rule's evidence lives, named in the link itself so the
 * reader knows where they are going before they go.
 */
const DESTINATION_LABELS = {
  '/inventory': 'insights.links.inventory',
  '/customers': 'insights.links.customers',
  '/expenses': 'insights.links.expenses',
};

/**
 * Turns a rule's link payload into a route and a label.
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

  return {
    href: search ? `${target}?${search}` : target,
    label: DESTINATION_LABELS[target] ?? 'insights.links.figures',
  };
}
