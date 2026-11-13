'use client';

import Link from 'next/link';

import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { EmptyFeed, SEVERITY, linkFor } from '@/features/insights/InsightFeed';
import { cn } from '@/lib/cn';
import { formatNumber } from '@/lib/format';

const VISIBLE = 3;

/**
 * "What to do this week": the first three findings the server ranked, each a
 * short sentence and one button to the evidence.
 *
 * The order is the server's (the insights endpoint ranks by severity), and
 * the number on each card is its place in that order, so the reader knows
 * where to start. The first card's button is the solid one: one primary
 * action on the row, not three competing.
 *
 * An empty row is never blank. "Nothing crossed a threshold" and "the rules
 * were not allowed to run" are different answers, and EmptyFeed says which.
 */
export function WeekActions({ insights = [], suppressed = null, loading = false, viewAllHref }) {
  const { t } = useI18n();
  const shown = insights.slice(0, VISIBLE);

  return (
    <section aria-labelledby="week-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <h2 id="week-title" className="text-lg font-bold text-(--color-text)">
            {t('dashboard.home.week.title')}
          </h2>
          <p className="text-sm text-(--color-text-2)">{t('dashboard.home.week.subtitle')}</p>
        </div>

        {viewAllHref && insights.length > 0 && (
          <Link
            href={viewAllHref}
            className="inline-flex min-h-8 items-center gap-1 text-sm font-semibold text-(--color-brand-text) hover:underline"
          >
            {t('dashboard.home.week.all', { count: formatNumber(insights.length) })}
            <Icon name="arrowRight" size={14} className="rtl:-scale-x-100" />
          </Link>
        )}
      </div>

      {loading ? (
        <ul className="grid gap-3.5 md:grid-cols-3" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <li key={index} className="skeleton h-44 rounded-(--radius-card)" />
          ))}
        </ul>
      ) : shown.length === 0 ? (
        <div className="rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-2">
          <EmptyFeed suppressed={suppressed} />
        </div>
      ) : (
        <ol
          className={cn(
            'grid gap-3.5',
            shown.length > 1 && 'md:grid-cols-2',
            shown.length > 2 && 'lg:grid-cols-3',
          )}
        >
          {shown.map((insight, index) => (
            <ActionCard key={insight.id} insight={insight} rank={index + 1} primary={index === 0} />
          ))}
        </ol>
      )}
    </section>
  );
}

function ActionCard({ insight, rank, primary }) {
  const { t } = useI18n();
  const severity = SEVERITY[insight.severity] ?? SEVERITY.warning;
  const target = linkFor(insight.link);

  return (
    <li
      data-week-card
      className="flex min-w-0 flex-col gap-3 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-[1.125rem] transition-[border-color,box-shadow] duration-(--duration-base) hover:border-(--color-border) hover:shadow-(--shadow-card)"
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn('inline-flex items-center gap-2 text-xs font-semibold', severity.text)}>
          <span
            aria-hidden="true"
            className={cn(
              'inline-flex size-[1.875rem] items-center justify-center rounded-(--radius-control)',
              severity.tile,
            )}
          >
            <Icon name={severity.icon} size={16} strokeWidth={2} />
          </span>
          {t(severity.label)}
        </span>
        <span className="tabular text-xs text-(--color-text-2)" aria-hidden="true">
          {formatNumber(rank)}
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <h3 className="text-[0.9375rem] leading-snug font-semibold text-(--color-text)">
          {insight.title}
        </h3>
        <p className="text-[0.8125rem] leading-relaxed text-(--color-text-2)">{insight.message}</p>
      </div>

      {target && (
        <Link
          href={target.href}
          className={cn(
            'mt-auto inline-flex h-[2.375rem] items-center justify-center rounded-(--radius-control) px-3 text-[0.8125rem] font-semibold transition-colors duration-(--duration-fast)',
            primary
              ? 'bg-(--color-brand) text-(--color-text-inverse) hover:bg-(--color-brand-hover)'
              : 'border border-(--color-border) bg-(--color-surface) text-(--color-text) hover:bg-(--color-surface-hover)',
          )}
        >
          {t(target.label)}
        </Link>
      )}
    </li>
  );
}
