'use client';

import Link from 'next/link';

import { Card } from '@/components/layout/PageHeader';
import { Icon } from '@/components/ui/Icon';
import { useActivity } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import {
  EMPTY,
  changeTone,
  figureDirection,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRelative,
} from '@/lib/format';

/**
 * The dashboard's panels other than charts and KPI cards.
 *
 * Every figure is the server's: shares, trends and growth arrive computed, and
 * nothing here divides, sums or compares. What a role may not see arrives
 * absent, and the panel either closes up around it or is not rendered.
 */

/* -------------------------------------------------------------------------- */
/* Shared pieces                                                               */
/* -------------------------------------------------------------------------- */

export function ViewAll({ href, label }) {
  return (
    <Link
      href={href}
      className="group inline-flex shrink-0 items-center gap-1 rounded-(--radius-control) text-xs font-medium text-(--color-brand-text) hover:underline"
    >
      {label}
      <Icon
        name="arrowRight"
        size={13}
        className="transition-transform duration-150 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
      />
    </Link>
  );
}

/** An arrow and a percentage, coloured by what the change means for the business. */
export function Trend({ change, favourable = 'up', className }) {
  const { t } = useI18n();

  if (change === null || change === undefined) {
    return <span className={cn('tabular text-xs text-(--color-muted)', className)}>{EMPTY}</span>;
  }

  const tone = changeTone(change, favourable);
  const text = formatPercent(Math.abs(change));

  return (
    <span
      data-tone={tone}
      className={cn(
        'tabular inline-flex items-center gap-1 text-xs font-semibold whitespace-nowrap',
        tone === 'positive'
          ? 'text-(--color-success)'
          : tone === 'negative'
            ? 'text-(--color-danger)'
            : 'text-(--color-text-2)',
        className,
      )}
    >
      <Icon
        name={change > 0 ? 'arrowUp' : change < 0 ? 'arrowDown' : 'arrowRight'}
        size={12}
        strokeWidth={2.5}
        label={change > 0 ? t('comparison.up') : change < 0 ? t('comparison.down') : undefined}
      />
      <bdi dir={figureDirection(text)}>{text}</bdi>
    </span>
  );
}

function RowsSkeleton({ rows = 4 }) {
  return (
    <div className="space-y-3 px-5 py-4" aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="skeleton h-4 rounded-(--radius-control)" />
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Period notice                                                               */
/* -------------------------------------------------------------------------- */

/**
 * An incomplete period compared against a complete one is stated outright,
 * once, beside the greeting. Without it, a dashboard on the 2nd of the month
 * reads as a collapse in trade rather than a month that has barely started.
 */
export function PeriodStatus({ show, againstComplete = false }) {
  const { t } = useI18n();

  if (!show) return null;

  return (
    <div role="status" className="flex max-w-md items-center gap-3">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-(--color-surface-hover) px-3 py-1.5 text-xs font-medium text-(--color-text-2)">
        <Icon name="info" size={14} />
        {t('period.incomplete')}
      </span>
      <span className="text-xs leading-relaxed text-(--color-text-2)">
        {againstComplete ? t('dashboard.incompleteNote') : t('period.inProgressTitle')}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Top selling products                                                        */
/* -------------------------------------------------------------------------- */

const THUMB_TINTS = [
  'bg-(--color-info-soft) text-(--color-info)',
  'bg-(--color-success-soft) text-(--color-success)',
  'bg-(--color-warning-soft) text-(--color-warning)',
  'bg-(--color-surface-selected) text-(--color-brand)',
  'bg-(--color-danger-soft) text-(--color-danger)',
];

/**
 * A product's tile. Products carry no image, so the tile is the name's
 * initials on a tint chosen from the name — stable for a product, varied down
 * a list — rather than a stock photo that would claim a picture exists.
 */
function ProductThumb({ name = '' }) {
  const hash = [...name].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <span
      aria-hidden="true"
      className={cn(
        'inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-control) text-xs font-bold',
        THUMB_TINTS[hash % THUMB_TINTS.length],
      )}
    >
      {letters || '·'}
    </span>
  );
}

export function TopSellingCard({ rows = [], currency, decimals, loading, className, style }) {
  const { t } = useI18n();
  const ranked = rows.filter((row) => !row.is_other);

  return (
    <Card
      title={t('dashboard.topSelling.title')}
      icon="cube"
      padded={false}
      className={cn('flex flex-col', className)}
      bodyClassName="flex-1"
      style={style}
      actions={<ViewAll href="/products" label={t('common.viewAll')} />}
    >
      {loading ? (
        <RowsSkeleton />
      ) : ranked.length === 0 ? (
        <p className="px-5 py-6 text-sm text-(--color-text-2)">{t('charts.rankEmpty')}</p>
      ) : (
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full text-sm">
            <caption className="sr-only">{t('dashboard.topSelling.title')}</caption>
            <thead>
              <tr className="border-b border-(--color-line-subtle) text-xs text-(--color-muted)">
                <th scope="col" className="w-8 px-3 pb-2 text-start font-medium">
                  #
                </th>
                <th scope="col" className="px-3 pb-2 text-start font-medium">
                  {t('dashboard.topSelling.product')}
                </th>
                <th scope="col" className="px-3 pb-2 text-end font-medium whitespace-nowrap">
                  {t('dashboard.topSelling.units')}
                </th>
                <th scope="col" className="px-3 pb-2 text-end font-medium whitespace-nowrap">
                  {t('dashboard.topSelling.revenue')}
                </th>
                <th scope="col" className="px-3 pb-2 text-end font-medium whitespace-nowrap">
                  {t('dashboard.topSelling.trend')}
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, index) => (
                <tr
                  key={row.key}
                  className="border-b border-(--color-line-subtle) transition-colors duration-(--duration-fast) last:border-0 hover:bg-(--color-ground)"
                >
                  <td className="tabular px-3 py-2.5 text-(--color-muted)">
                    {formatNumber(index + 1)}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <ProductThumb name={row.label} />
                      <span dir="auto" className="max-w-48 truncate text-(--color-text)">
                        {row.label}
                      </span>
                    </span>
                  </td>
                  <td className="tabular px-3 py-2.5 text-end text-(--color-text)">
                    {formatNumber(row.units ?? 0)}
                  </td>
                  <td className="tabular px-3 py-2.5 text-end font-medium whitespace-nowrap text-(--color-text)">
                    {formatMoney(row.value, { currency, decimals })}
                  </td>
                  <td className="px-3 py-2.5 text-end">
                    <Trend change={row.change_pct} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Quick stats                                                                 */
/* -------------------------------------------------------------------------- */

const QUICK_STATS = [
  { key: 'products', label: 'dashboard.quickStats.products', icon: 'cube', format: 'number' },
  {
    key: 'customers',
    label: 'dashboard.quickStats.customers',
    icon: 'customers',
    format: 'number',
  },
  {
    key: 'inventory_value',
    label: 'dashboard.quickStats.inventoryValue',
    icon: 'wallet',
    format: 'money',
  },
  {
    key: 'receivables',
    label: 'dashboard.quickStats.receivables',
    icon: 'coins',
    format: 'money',
  },
  {
    key: 'active_users',
    label: 'dashboard.quickStats.activeUsers',
    icon: 'userCircle',
    format: 'number',
  },
];

export function QuickStatsCard({ stats, currency, loading, className, style }) {
  const { t } = useI18n();
  const shown = QUICK_STATS.filter((stat) => stats && stat.key in stats);

  return (
    <Card
      title={t('dashboard.quickStats.title')}
      icon="pulse"
      padded={false}
      className={className}
      style={style}
    >
      {loading ? (
        <RowsSkeleton />
      ) : (
        <ul className="px-5 pb-4">
          {shown.map((stat) => {
            const entry = stats[stat.key];
            const value =
              stat.format === 'money'
                ? formatMoneyCompact(entry.value, { currency })
                : formatNumber(entry.value);
            const exact =
              stat.format === 'money' ? formatMoney(entry.value, { currency }) : undefined;

            return (
              <li key={stat.key} className="flex items-center gap-2.5 py-2.5">
                <Icon name={stat.icon} size={16} className="shrink-0 text-(--color-text-2)" />
                <span className="min-w-0 flex-1 truncate text-xs text-(--color-text-2)">
                  {t(stat.label)}
                </span>
                <bdi
                  title={exact}
                  dir={figureDirection(value)}
                  className="tabular text-sm font-semibold whitespace-nowrap text-(--color-text)"
                >
                  {value}
                </bdi>
                {/* A change only where one honestly exists — growth of a count. */}
                {entry.change !== null && (
                  <span className="w-12 shrink-0 text-end">
                    <Trend change={entry.change} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Recent activity                                                             */
/* -------------------------------------------------------------------------- */

const ACTIVITY_QUERY = { per_page: 5 };

const ACTIVITY_TONES = {
  created: { icon: 'plus', tone: 'bg-(--color-info-soft) text-(--color-info)' },
  confirmed: { icon: 'check', tone: 'bg-(--color-info-soft) text-(--color-info)' },
  fulfilled: { icon: 'check', tone: 'bg-(--color-success-soft) text-(--color-success)' },
  updated: { icon: 'repeat', tone: 'bg-(--color-surface-hover) text-(--color-text-2)' },
  deleted: { icon: 'ban', tone: 'bg-(--color-danger-soft) text-(--color-danger)' },
  cancelled: { icon: 'ban', tone: 'bg-(--color-danger-soft) text-(--color-danger)' },
  refunded: { icon: 'undo', tone: 'bg-(--color-warning-soft) text-(--color-warning)' },
  login: { icon: 'userCircle', tone: 'bg-(--color-success-soft) text-(--color-success)' },
  logout: { icon: 'signOut', tone: 'bg-(--color-surface-hover) text-(--color-text-2)' },
  login_failed: { icon: 'alert', tone: 'bg-(--color-danger-soft) text-(--color-danger)' },
  lockout: { icon: 'alert', tone: 'bg-(--color-danger-soft) text-(--color-danger)' },
  generated: { icon: 'table', tone: 'bg-(--color-surface-selected) text-(--color-brand)' },
};

function describeEntry(t, entry) {
  const [, verb] = String(entry.action).split('.');
  const verbText = t.has(`dashboard.activity.verbs.${verb}`)
    ? t(`dashboard.activity.verbs.${verb}`)
    : String(verb ?? entry.action).replaceAll('_', ' ');

  // An export names what left the building.
  if (entry.action === 'export.generated') {
    return t('dashboard.activity.exported', { resource: entry.context?.resource ?? '' });
  }

  // Sign-ins read as something a person did; everything else as something that
  // happened to a record.
  if (String(entry.action).startsWith('auth.')) {
    return t('dashboard.activity.byActor', {
      actor: entry.actor?.name ?? t('activity.notSignedIn'),
      verb: verbText,
    });
  }

  const subject = entry.subject_type
    ? `${t.has(`activity.subjectTypes.${entry.subject_type}`) ? t(`activity.subjectTypes.${entry.subject_type}`) : entry.subject_type}${entry.subject_id ? ` #${entry.subject_id}` : ''}`
    : t('activity.subjects.export');

  return t('dashboard.activity.onSubject', { subject, verb: verbText });
}

export function RecentActivityCard({ className, style }) {
  const { t } = useI18n();
  const { entries, isLoading } = useActivity(ACTIVITY_QUERY);

  return (
    <Card
      title={t('dashboard.activity.title')}
      icon="activity"
      padded={false}
      className={className}
      style={style}
      actions={<ViewAll href="/activity" label={t('common.viewAll')} />}
    >
      {isLoading ? (
        <RowsSkeleton rows={5} />
      ) : entries.length === 0 ? (
        <p className="px-5 pb-5 text-sm text-(--color-text-2)">{t('dashboard.activity.empty')}</p>
      ) : (
        <ul className="px-5 pb-4">
          {entries.map((entry) => {
            const [, verb] = String(entry.action).split('.');
            const visual = ACTIVITY_TONES[verb] ?? ACTIVITY_TONES.updated;

            return (
              <li key={entry.id} className="flex items-center gap-3 py-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-6 shrink-0 items-center justify-center rounded-full',
                    visual.tone,
                  )}
                >
                  <Icon name={visual.icon} size={12} strokeWidth={2.25} />
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-(--color-text)">
                  {describeEntry(t, entry)}
                </span>
                <time
                  dateTime={entry.occurred_at}
                  className="shrink-0 text-xs whitespace-nowrap text-(--color-muted)"
                >
                  {formatRelative(entry.occurred_at)}
                </time>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Inventory status                                                            */
/* -------------------------------------------------------------------------- */

/**
 * How the active catalogue's stock is spread right now.
 *
 * A POINT-IN-TIME panel: it reflects now, not the selected period, and says so
 * to assistive technology and in a tooltip (METRICS.md §2.18). The three
 * states partition the catalogue, so their bars sum to the whole; each is named
 * in text and has its own icon, and the colour only repeats what the words say.
 */
const STOCK_STATES = [
  { key: 'in_stock', label: 'dashboard.inventory.inStock', icon: 'cube', tone: 'positive' },
  { key: 'low', label: 'dashboard.inventory.low', icon: 'alert', tone: 'warning' },
  { key: 'out', label: 'dashboard.inventory.out', icon: 'ban', tone: 'negative' },
];

const STOCK_TONES = {
  positive: {
    chip: 'bg-(--color-success-soft) text-(--color-success)',
    bar: 'bg-(--color-success)',
  },
  warning: {
    chip: 'bg-(--color-warning-soft) text-(--color-warning)',
    bar: 'bg-(--color-warning)',
  },
  negative: {
    chip: 'bg-(--color-danger-soft) text-(--color-danger)',
    bar: 'bg-(--color-danger)',
  },
};

export function InventoryStatusCard({ status, loading, className, style }) {
  const { t } = useI18n();
  const total = status?.total ?? 0;

  return (
    <Card
      title={t('dashboard.inventory.title')}
      icon="inventory"
      padded={false}
      className={className}
      style={style}
      actions={<ViewAll href="/inventory?low_stock=true" label={t('common.viewAll')} />}
    >
      <p className="sr-only">{t('dashboard.lowStock.description')}</p>

      {loading ? (
        <RowsSkeleton rows={3} />
      ) : (
        <ul className="space-y-5 px-5 pt-2 pb-5" title={t('dashboard.lowStock.description')}>
          {STOCK_STATES.map((state) => {
            const count = status?.[state.key] ?? 0;
            const share = total > 0 ? count / total : 0;

            return (
              <li key={state.key} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className={cn(
                    'inline-flex size-8 shrink-0 items-center justify-center rounded-full',
                    STOCK_TONES[state.tone].chip,
                  )}
                >
                  <Icon name={state.icon} size={15} strokeWidth={2} />
                </span>

                <div className="min-w-0 flex-1">
                  <p className="flex min-w-0 items-baseline gap-2 text-xs">
                    <span className="font-semibold text-(--color-text)">{t(state.label)}</span>
                    <span className="truncate text-(--color-muted)">
                      {t('dashboard.inventory.products', { count })}
                    </span>
                  </p>
                  <div className="mt-2 flex items-center gap-3">
                    <div
                      aria-hidden="true"
                      className="h-1.5 flex-1 overflow-hidden rounded-full bg-(--color-surface-hover)"
                    >
                      <div
                        className={cn('bar-grow h-full rounded-full', STOCK_TONES[state.tone].bar)}
                        style={{ width: `${share * 100}%` }}
                      />
                    </div>
                    <span className="tabular w-9 shrink-0 text-end text-xs text-(--color-text-2)">
                      {formatPercent(share, { decimals: 0 })}
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Explore analytics                                                           */
/* -------------------------------------------------------------------------- */

export function ExploreAnalyticsCard({ className, style }) {
  const { t } = useI18n();

  return (
    <section
      style={style}
      className={cn(
        'relative overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-6',
        className,
      )}
    >
      {/* A drawn chart, not a stock illustration: bars rising into a trend line. */}
      <svg aria-hidden="true" viewBox="0 0 120 64" className="h-16 w-28" focusable="false">
        <rect
          x="6"
          y="8"
          width="72"
          height="50"
          rx="10"
          fill="var(--surface)"
          stroke="var(--border)"
        />
        <rect x="20" y="36" width="8" height="14" rx="2" fill="var(--chart-1)" opacity="0.45" />
        <rect x="34" y="28" width="8" height="22" rx="2" fill="var(--chart-1)" opacity="0.7" />
        <rect x="48" y="20" width="8" height="30" rx="2" fill="var(--chart-1)" />
        <path
          d="M66 40c14-4 26-14 36-30"
          fill="none"
          stroke="var(--brand-text)"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M94 8h10v10"
          fill="none"
          stroke="var(--brand-text)"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.55"
        />
      </svg>

      <h2 className="mt-4 text-lg font-semibold text-(--color-text)">
        {t('dashboard.explore.title')}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-(--color-text-2)">
        {t('dashboard.explore.body')}
      </p>
      <Link
        href="/analytics"
        className="mt-5 inline-flex h-10 items-center gap-2 rounded-(--radius-control) bg-(--color-brand) px-5 text-sm font-semibold text-(--color-text-inverse) transition-colors hover:bg-(--color-brand-hover)"
      >
        {t('dashboard.explore.action')}
        <Icon name="arrowRight" size={15} className="rtl:-scale-x-100" />
      </Link>
    </section>
  );
}
