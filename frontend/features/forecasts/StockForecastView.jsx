'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Badge } from '@/components/ui/Badge';
import { Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/layout/PageHeader';
import { DataTable } from '@/components/data/DataTable';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/data/States';
import { Sparkline } from '@/components/charts/Sparkline';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import * as forecasts from '@/services/forecasts';

/**
 * When each product runs out, and what to order (phase D1).
 *
 * THREE THINGS ON TOP, IN THE ORDER AN OWNER NEEDS THEM: how many products
 * need attention and how urgently (the status cards, which also filter the
 * list); how far to trust the forecast (its accuracy over the last four
 * weeks, said in a sentence); and the two assumptions it rests on, which
 * the owner can change — how long the supplier takes, and how many days an
 * order should cover.
 *
 * Then the list, most urgent first. Each row carries its last eight weeks as
 * a sparkline, so a rate that rests on one big order is visibly lumpy.
 */
const STATUSES = [
  { key: 'out', tone: 'danger', icon: 'ban' },
  { key: 'order_now', tone: 'warning', icon: 'alert' },
  { key: 'soon', tone: 'info', icon: 'clock' },
  { key: 'ok', tone: 'success', icon: 'check' },
];

const CARD_TONES = {
  danger: 'bg-(--color-danger-soft) text-(--color-danger)',
  warning: 'bg-(--color-warning-soft) text-(--color-warning)',
  info: 'bg-(--color-info-soft) text-(--color-info)',
  success: 'bg-(--color-success-soft) text-(--color-success)',
};

const BADGE_TONES = { out: 'negative', order_now: 'warning', soon: 'accent', ok: 'positive' };
const CONFIDENCE_TONES = { high: 'positive', medium: 'neutral', low: 'warning' };

export function StockForecastView() {
  const { t } = useI18n();
  const [leadTime, setLeadTime] = useState(7);
  const [coverDays, setCoverDays] = useState(30);
  const [status, setStatus] = useState(null);

  const query = useQuery({
    queryKey: queryKeys.forecasts.stock(leadTime, coverDays),
    queryFn: () => forecasts.stock({ lead_time: leadTime, cover_days: coverDays }),
    placeholderData: (previous) => previous,
  });

  if (query.isError && query.error?.isForbidden) return <ForbiddenState />;

  const data = query.data?.data;
  const items = (data?.items ?? []).filter((item) => !status || item.status === status);
  const withCost = (data?.items ?? []).some((item) => item.suggested_cost !== null);

  const columns = [
    {
      key: 'name',
      header: t('forecasts.stock.columns.product'),
      cell: (row) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-(--color-text)" style={{ unicodeBidi: 'plaintext' }}>
            {row.name}
          </span>
          <span className="block text-xs text-(--color-muted)">{row.sku}</span>
        </span>
      ),
    },
    {
      key: 'trend',
      header: t('forecasts.stock.columns.trend'),
      width: '7rem',
      cell: (row) => (
        <div dir="ltr" title={row.weekly_units.map((units) => formatNumber(units)).join(' · ')}>
          <Sparkline values={row.weekly_units} height={28} />
        </div>
      ),
    },
    {
      key: 'stock',
      header: t('forecasts.stock.columns.stock'),
      numeric: true,
      width: '6rem',
      cell: (row) => formatNumber(row.stock),
    },
    {
      key: 'daily_rate',
      header: t('forecasts.stock.columns.rate'),
      numeric: true,
      width: '7rem',
      cell: (row) => formatNumber(row.daily_rate, { decimals: 1 }),
    },
    {
      key: 'run_out_on',
      header: t('forecasts.stock.columns.runOut'),
      width: '9rem',
      cell: (row) => (
        <span>
          <span className="block text-(--color-text)">{formatDate(row.run_out_on)}</span>
          <span className="block text-xs text-(--color-muted)">
            {t('forecasts.stock.daysLeft', { days: formatNumber(row.days_left, { decimals: 0 }) })}
          </span>
        </span>
      ),
    },
    {
      key: 'order_by',
      header: t('forecasts.stock.columns.orderBy'),
      width: '10rem',
      cell: (row) => <Badge tone={BADGE_TONES[row.status]}>{row.status === 'ok' ? formatDate(row.order_by) : t(`forecasts.stock.status.${row.status}`)}</Badge>,
    },
    {
      key: 'suggested_quantity',
      header: t('forecasts.stock.columns.suggested'),
      numeric: true,
      width: '8rem',
      cell: (row) => (
        <span>
          <span className="block font-semibold text-(--color-text)">{formatNumber(row.suggested_quantity)}</span>
          {withCost && row.suggested_cost !== null ? (
            <span className="block text-xs text-(--color-muted)">{formatMoney(row.suggested_cost)}</span>
          ) : null}
        </span>
      ),
    },
    {
      key: 'confidence',
      header: t('forecasts.stock.columns.confidence'),
      width: '7rem',
      cell: (row) => <Badge tone={CONFIDENCE_TONES[row.confidence]}>{t(`forecasts.stock.confidence.${row.confidence}`)}</Badge>,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {STATUSES.map(({ key, tone, icon }) => {
          const active = status === key;

          return (
            <button
              key={key}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(active ? null : key)}
              className={cn(
                'flex items-center gap-3 rounded-(--radius-card) border bg-(--color-surface) p-4 text-start transition-colors',
                active ? 'border-(--color-brand) ring-1 ring-(--color-brand)' : 'border-(--color-line) hover:border-(--color-brand)',
              )}
            >
              <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl', CARD_TONES[tone])}>
                <Icon name={icon} size={18} aria-hidden="true" />
              </span>
              <span>
                <span className="tabular block text-2xl font-semibold text-(--color-text)">
                  {data ? formatNumber(data.counts[key]) : '—'}
                </span>
                <span className="block text-xs text-(--color-text-2)">{t(`forecasts.stock.status.${key}`)}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <Card>
          <div className="flex items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--color-brand-soft) text-(--color-brand-text)">
              <Icon name="focus" size={18} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-(--color-text)">
                {data?.accuracy === null || data?.accuracy === undefined
                  ? t('forecasts.stock.accuracyUnknown')
                  : t('forecasts.stock.accuracy', { accuracy: formatPercent(data.accuracy, { decimals: 0 }) })}
              </p>
              <p className="measure mt-1 text-xs leading-relaxed text-(--color-text-2)">{t('forecasts.stock.method')}</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-(--color-text-2)">{t('forecasts.stock.leadTime')}</span>
              <Select
                value={leadTime}
                onChange={(event) => setLeadTime(Number(event.target.value))}
                options={[3, 7, 14, 21, 30, 45].map((days) => ({ value: days, label: t('forecasts.stock.days', { days: formatNumber(days) }) }))}
                className="w-32"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-(--color-text-2)">{t('forecasts.stock.cover')}</span>
              <Select
                value={coverDays}
                onChange={(event) => setCoverDays(Number(event.target.value))}
                options={[14, 30, 60, 90].map((days) => ({ value: days, label: t('forecasts.stock.days', { days: formatNumber(days) }) }))}
                className="w-32"
              />
            </label>
          </div>
        </Card>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={query.refetch} />
      ) : (
        <Card padded={false}>
          <DataTable
            bare
            caption={t('forecasts.stock.title')}
            columns={columns}
            rows={items}
            getRowId={(row) => row.product_id}
            loading={query.isLoading}
            empty={<EmptyState title={t('forecasts.stock.empty.title')} description={t('forecasts.stock.empty.description')} />}
          />
        </Card>
      )}

      <p className="measure text-xs text-(--color-muted)">{t('forecasts.stock.seasonality')}</p>
    </div>
  );
}
