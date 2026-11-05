'use client';

import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { EmptyFeed, SEVERITY, linkFor } from '@/features/insights/InsightFeed';
import { cn } from '@/lib/cn';

/**
 * "Needs your attention": the insights, as things to do.
 *
 * The same rules and the same sentences as the Key Insights feed, which this
 * replaces on the dashboard. What changes is the shape. In a narrow column
 * beside twelve figures, an insight was one more paragraph to read; here each
 * is a card across the page with its next step as the card's own action, so
 * a reader who opens the dashboard asking "what should I do?" is answered
 * before they have scrolled.
 *
 * THE ORDER IS THE SERVER'S. The rules already rank what they find; the first
 * three are shown and the rest are behind "view all". Choosing differently
 * here would be a second opinion about severity, and the server's is the one
 * written down (METRICS.md §4).
 *
 * The empty states are the feed's own, so "nothing crossed a threshold" and
 * "held back because the period is still running" stay distinct.
 */
const VISIBLE = 3;

export function AttentionStrip({ insights = [], suppressed = null, loading = false, viewAllHref }) {
  const { t } = useI18n();
  const shown = insights.slice(0, VISIBLE);
  const more = insights.length - shown.length;

  return (
    <section aria-labelledby="attention-title" className="rise" style={{ '--rise-index': 3 }}>
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 id="attention-title" className="text-lg font-bold text-(--color-text)">
            {t('dashboard.attention.title')}
          </h2>
          <p className="mt-0.5 text-sm text-(--color-text-2)">
            {t('dashboard.attention.subtitle')}
          </p>
        </div>

        {viewAllHref && insights.length > 0 && (
          <Link
            href={viewAllHref}
            className="group inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-(--color-brand-text) hover:underline"
          >
            {more > 0 ? t('dashboard.attention.more', { count: more }) : t('common.viewAll')}
            <Icon name="arrowRight" size={14} className="rtl:-scale-x-100" />
          </Link>
        )}
      </div>

      <div className="mt-4">
        {loading ? (
          <ul className="grid gap-4 md:grid-cols-3" aria-hidden="true">
            {[0, 1, 2].map((index) => (
              <li key={index} className="skeleton h-36 rounded-(--radius-card)" />
            ))}
          </ul>
        ) : shown.length === 0 ? (
          <div className="rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-2">
            <EmptyFeed suppressed={suppressed} />
          </div>
        ) : (
          <ul
            className={cn(
              'grid gap-4',
              shown.length > 1 && 'md:grid-cols-2',
              shown.length > 2 && 'lg:grid-cols-3',
            )}
          >
            {shown.map((insight) => (
              <AttentionCard key={insight.id} insight={insight} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function AttentionCard({ insight }) {
  const { t } = useI18n();
  const severity = SEVERITY[insight.severity] ?? SEVERITY.warning;
  const target = linkFor(insight.link);

  return (
    <li className="group relative flex flex-col overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5 shadow-(--shadow-card) transition-[box-shadow,transform] duration-(--duration-base) ease-(--ease-out) hover:-translate-y-0.5 hover:shadow-(--shadow-card-hover)">
      {/* A strip of the severity's tone along the top: the kind, seen before it is read. */}
      <span aria-hidden="true" className={cn('absolute inset-x-0 top-0 h-1', severity.tile)} />

      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-10 shrink-0 items-center justify-center rounded-full',
            severity.tile,
          )}
        >
          <Icon name={severity.icon} size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0">
          <p className={cn('text-xs font-semibold', severity.text)}>{t(severity.label)}</p>
          <p className="mt-0.5 text-base leading-snug font-semibold text-(--color-text)">
            {insight.title}
          </p>
        </div>
      </div>

      <p className="mt-3 flex-1 text-sm leading-relaxed text-(--color-text-2)">{insight.message}</p>

      {target && (
        <Link
          href={target.href}
          className="mt-4 inline-flex items-center gap-1.5 self-start rounded-(--radius-pill) bg-(--color-brand-soft) px-3.5 py-2 text-sm font-semibold text-(--color-brand-text) transition-colors duration-(--duration-fast) after:absolute after:inset-0 hover:bg-(--color-surface-selected)"
        >
          {/*
            The whole card is the target (the link's ::after covers it), and
            the link's own text names where it goes. It carries the period
            the insight was computed for, so the screen it opens shows the
            figures the sentence quoted.
          */}
          {t(target.label)}
          <Icon
            name="arrowRight"
            size={14}
            className="transition-transform duration-(--duration-fast) group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
          />
        </Link>
      )}
    </li>
  );
}
