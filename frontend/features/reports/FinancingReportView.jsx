'use client';

import { useQuery } from '@tanstack/react-query';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { cn } from '@/lib/cn';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  getFormatLocale,
} from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import * as reports from '@/services/reports';

/**
 * The financing report (phase D3): the document an owner hands a bank, or
 * a programme that lends to small businesses.
 *
 * A PAGE, PRINTED TO PDF BY THE BROWSER. Arabic is joined, shaped and set
 * right to left by the same engine that draws the rest of the app; the PHP
 * PDF libraries either break Arabic letters apart or carry a hundred
 * megabytes of fonts into every server. "Download PDF" opens the print
 * dialog, and the print styles lay it out as A4: the app's chrome is gone,
 * each section keeps together, and the cash forecast starts a new page.
 *
 * WHAT A LENDER ASKS, IN ORDER: who the business is, whether it makes
 * money, what it holds and is owed today, and whether the cash lasts.
 * Then what the figures do not know, said in the document rather than left
 * for the lender to find. The client computes nothing: every figure, total
 * and margin arrives from the server, from the same functions as the
 * dashboard.
 */
export function FinancingReportView() {
  const { t } = useI18n();
  const query = useQuery({
    queryKey: queryKeys.reports.financing,
    queryFn: reports.financing,
    // A document: drawn up once when opened, not refreshed under the reader.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (query.isError && query.error?.isForbidden) return <ForbiddenState />;
  if (query.isError) return <ErrorState error={query.error} onRetry={query.refetch} />;

  const data = query.data?.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="measure text-sm text-(--color-text-2)">{t('reports.financing.howTo')}</p>
        <Button variant="primary" disabled={!data} onClick={() => window.print()}>
          <Icon name="fileChart" size={16} aria-hidden="true" />
          {t('reports.financing.download')}
        </Button>
      </div>

      <article
        aria-label={t('reports.financing.title')}
        className="mx-auto max-w-[210mm] rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-6 shadow-(--shadow-card) sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none"
      >
        {data ? <Report data={data} /> : <SkeletonText lines={12} />}
      </article>
    </div>
  );
}

function Report({ data }) {
  const { t } = useI18n();
  const { business, totals, prior, position } = data;
  const forecast = data.cash_forecast;
  const hasBalance = forecast.opening_balance !== null;

  return (
    <div className="space-y-8 text-(--color-text) print:space-y-6 print:text-[10.5pt]">
      {/* Who the business is, and what this document is. */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-2 border-(--color-brand-panel) pb-6">
        <div>
          <p className="text-xs font-semibold tracking-wide text-(--color-brand-text) uppercase">
            {t('reports.financing.kicker')}
          </p>
          <h1 className="mt-1 text-2xl font-bold" style={{ unicodeBidi: 'plaintext' }}>
            {business.name}
          </h1>
          <p className="mt-1 text-sm text-(--color-text-2)">
            {t('reports.financing.period', {
              from: formatDate(data.period.from),
              to: formatDate(data.period.to),
            })}
          </p>
        </div>
        <dl className="grid grid-cols-[auto_auto] gap-x-4 gap-y-1 text-xs">
          {business.commercial_registration ? (
            <Meta label={t('reports.financing.cr')} value={business.commercial_registration} />
          ) : null}
          {business.vat_number ? (
            <Meta label={t('reports.financing.vat')} value={business.vat_number} />
          ) : null}
          <Meta label={t('reports.financing.currency')} value={business.currency} />
          <Meta
            label={t('reports.financing.generated')}
            value={formatDateTime(data.generated_at)}
          />
          <Meta label={t('reports.financing.preparedBy')} value={data.prepared_by} />
        </dl>
      </header>

      <Section number={1} title={t('reports.financing.summary.title')}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi
            label={t('reports.financing.summary.revenue')}
            value={formatMoney(totals.net_revenue)}
          >
            {prior.revenue_growth !== null
              ? t('reports.financing.summary.growth', {
                  change: formatPercent(prior.revenue_growth, { decimals: 0, sign: true }),
                })
              : t('reports.financing.summary.noPrior')}
          </Kpi>
          <Kpi
            label={t('reports.financing.summary.grossProfit')}
            value={formatMoney(totals.gross_profit)}
          >
            {totals.gross_margin !== null
              ? t('reports.financing.summary.margin', {
                  margin: formatPercent(totals.gross_margin, { decimals: 1 }),
                })
              : null}
          </Kpi>
          <Kpi
            label={t('reports.financing.summary.netProfit')}
            value={formatMoney(totals.net_profit)}
            tone={Number(totals.net_profit) < 0 ? 'negative' : undefined}
          >
            {totals.net_margin !== null
              ? t('reports.financing.summary.margin', {
                  margin: formatPercent(totals.net_margin, { decimals: 1 }),
                })
              : null}
          </Kpi>
          <Kpi label={t('reports.financing.summary.orders')} value={formatNumber(totals.orders)} />
        </div>
      </Section>

      <Section
        number={2}
        title={t('reports.financing.pnl.title')}
        description={t('reports.financing.pnl.description')}
      >
        <RevenueBars months={data.months} />
        <ProfitAndLoss months={data.months} totals={totals} />
      </Section>

      {data.expenses_by_category.length ? (
        <Section number={3} title={t('reports.financing.expenses.title')}>
          <ExpenseShares items={data.expenses_by_category} total={totals.operating_expenses} />
        </Section>
      ) : null}

      <Section
        number={4}
        title={t('reports.financing.position.title')}
        description={t('reports.financing.position.description')}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Kpi
            label={t('reports.financing.position.cash')}
            value={
              position.cash_balance !== null
                ? formatMoney(position.cash_balance)
                : t('reports.financing.position.notStated')
            }
          >
            {position.cash_balance_as_of
              ? t('reports.financing.position.statedOn', {
                  date: formatDate(position.cash_balance_as_of),
                })
              : null}
          </Kpi>
          <Kpi
            label={t('reports.financing.position.receivables')}
            value={formatMoney(position.receivables)}
          />
          <Kpi
            label={t('reports.financing.position.inventory')}
            value={formatMoney(position.inventory_value)}
          >
            {t('reports.financing.position.atCost')}
          </Kpi>
        </div>
      </Section>

      <Section
        number={5}
        title={t('reports.financing.cash.title')}
        description={
          hasBalance
            ? t('reports.financing.cash.fromBalance')
            : t('reports.financing.cash.fromZero')
        }
        breakBefore
      >
        <CashVerdict forecast={forecast} hasBalance={hasBalance} />
        <CashTable forecast={forecast} hasBalance={hasBalance} />
        <CashAssumptions assumptions={forecast.assumptions} />
      </Section>

      <Section number={6} title={t('reports.financing.notes.title')}>
        <ul className="list-disc space-y-1.5 ps-5 text-sm leading-6 text-(--color-text-2)">
          <li>{t('reports.financing.notes.source')}</li>
          <li>{t('reports.financing.notes.unaudited')}</li>
          {data.caveats.zero_cost_items > 0 ? (
            <li className="font-medium text-(--color-text)">
              {t('reports.financing.notes.zeroCost', {
                count: formatNumber(data.caveats.zero_cost_items),
              })}
            </li>
          ) : null}
          {!hasBalance ? <li>{t('reports.financing.notes.noBalance')}</li> : null}
          <li>{t('reports.financing.notes.notIncluded')}</li>
        </ul>
      </Section>

      <footer className="flex items-center justify-between gap-4 border-t border-(--color-line) pt-4 text-xs text-(--color-muted)">
        <span style={{ unicodeBidi: 'plaintext' }}>{business.name}</span>
        <span>{t('reports.financing.footer')}</span>
      </footer>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <>
      <dt className="text-(--color-muted)">{label}</dt>
      <dd className="tabular font-medium" style={{ unicodeBidi: 'plaintext' }}>
        {value}
      </dd>
    </>
  );
}

function Section({ number, title, description, breakBefore = false, children }) {
  return (
    <section className={cn('space-y-4', breakBefore && 'print:break-before-page')}>
      <div className="break-after-avoid">
        <h2 className="flex items-center gap-2.5 text-base font-bold">
          <span
            aria-hidden="true"
            className="tabular flex size-6 items-center justify-center rounded-md bg-(--color-brand-panel) text-xs text-(--color-on-brand)"
          >
            {formatNumber(number)}
          </span>
          {title}
        </h2>
        {description ? (
          <p className="measure mt-1 text-sm text-(--color-text-2)">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, tone, children }) {
  return (
    <div className="break-inside-avoid rounded-xl border border-(--color-line) p-3.5">
      <p className="text-xs text-(--color-text-2)">{label}</p>
      <p
        className={cn(
          'tabular mt-1 text-lg font-bold',
          tone === 'negative' && 'text-(--color-danger)',
        )}
      >
        {value}
      </p>
      {children ? <p className="mt-0.5 text-xs text-(--color-muted)">{children}</p> : null}
    </div>
  );
}

function monthLabel(month) {
  return new Intl.DateTimeFormat(getFormatLocale(), {
    timeZone: 'UTC',
    month: 'short',
    year: '2-digit',
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/**
 * Twelve months of revenue as plain bars. Drawn with boxes rather than a
 * chart library, so they print exactly as they look, at any page size.
 */
function RevenueBars({ months }) {
  const { t } = useI18n();
  const max = Math.max(...months.map((month) => Number(month.net_revenue) || 0), 0);

  if (max <= 0) return null;

  return (
    <figure className="break-inside-avoid" aria-label={t('reports.financing.pnl.chart')}>
      <div className="flex h-32 items-end gap-1.5" dir="ltr">
        {months.map((month) => {
          const height = Math.max(((Number(month.net_revenue) || 0) / max) * 100, 1);

          return (
            <div
              key={month.month}
              className="flex h-full flex-1 flex-col justify-end"
              title={formatMoney(month.net_revenue)}
            >
              <div
                className="rounded-t-[3px] bg-(--chart-1) print:[print-color-adjust:exact]"
                style={{ height: `${height}%` }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 flex gap-1.5 text-[10px] text-(--color-muted)" dir="ltr">
        {months.map((month) => (
          <span key={month.month} className="flex-1 text-center">
            {monthLabel(month.month)}
          </span>
        ))}
      </div>
    </figure>
  );
}

function ProfitAndLoss({ months, totals }) {
  const { t } = useI18n();
  const columns = ['net_revenue', 'cogs', 'gross_profit', 'operating_expenses', 'net_profit'];

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm print:text-[9.5pt]">
        <caption className="sr-only">{t('reports.financing.pnl.title')}</caption>
        <thead>
          <tr className="border-b-2 border-(--color-line-strong) text-xs text-(--color-text-2)">
            <th scope="col" className="py-2 text-start font-semibold">
              {t('reports.financing.pnl.month')}
            </th>
            {columns.map((key) => (
              <th key={key} scope="col" className="py-2 ps-3 text-end font-semibold">
                {t(`reports.financing.pnl.${key}`)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month} className="break-inside-avoid border-b border-(--border-subtle)">
              <th scope="row" className="py-1.5 text-start font-medium">
                {monthLabel(month.month)}
              </th>
              {columns.map((key) => (
                <td
                  key={key}
                  className={cn(
                    'tabular py-1.5 ps-3 text-end',
                    key === 'net_profit' && Number(month[key]) < 0 && 'text-(--color-danger)',
                  )}
                >
                  {formatMoney(month[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-(--color-line-strong) font-bold">
            <th scope="row" className="py-2 text-start">
              {t('reports.financing.pnl.total')}
            </th>
            {columns.map((key) => (
              <td key={key} className="tabular py-2 ps-3 text-end">
                {formatMoney(totals[key])}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Each category's share of the running costs. The share is a width, not a figure the client claims. */
function ExpenseShares({ items, total }) {
  const whole = Number(total) || 0;

  return (
    <ul className="grid gap-x-8 gap-y-2.5 sm:grid-cols-2">
      {items.slice(0, 8).map((item) => {
        const share = whole > 0 ? (Number(item.amount) / whole) * 100 : 0;

        return (
          <li key={item.category} className="break-inside-avoid">
            <p className="flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate" style={{ unicodeBidi: 'plaintext' }}>
                {item.category}
              </span>
              <span className="tabular font-semibold">{formatMoney(item.amount)}</span>
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-(--color-surface-selected)">
              <div
                className="h-full rounded-full bg-(--chart-2) print:[print-color-adjust:exact]"
                style={{ width: `${share}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function CashVerdict({ forecast, hasBalance }) {
  const { t } = useI18n();

  let text;

  if (!hasBalance) {
    text = t('reports.financing.cash.lowestNet', {
      amount: formatMoney(forecast.lowest?.value),
      date: formatDate(forecast.lowest?.start),
    });
  } else if (forecast.first_negative_week) {
    text = t('forecasts.cash.verdict.negative', {
      date: formatDate(forecast.first_negative_week.start),
    });
  } else {
    text = t('forecasts.cash.verdict.lasts', {
      amount: formatMoney(forecast.lowest?.value),
      date: formatDate(forecast.lowest?.start),
    });
  }

  return (
    <p
      className={cn(
        'break-inside-avoid rounded-xl border-s-4 bg-(--color-ground) p-3 text-sm font-medium print:[print-color-adjust:exact]',
        hasBalance && forecast.first_negative_week
          ? 'border-(--color-danger)'
          : 'border-(--color-brand)',
      )}
    >
      {text}
    </p>
  );
}

function CashTable({ forecast, hasBalance }) {
  const { t } = useI18n();

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm print:text-[9.5pt]">
        <caption className="sr-only">{t('reports.financing.cash.title')}</caption>
        <thead>
          <tr className="border-b-2 border-(--color-line-strong) text-xs text-(--color-text-2)">
            <th scope="col" className="py-2 text-start font-semibold">
              {t('forecasts.cash.columns.week')}
            </th>
            <th scope="col" className="py-2 ps-3 text-end font-semibold">
              {t('forecasts.cash.columns.in')}
            </th>
            <th scope="col" className="py-2 ps-3 text-end font-semibold">
              {t('forecasts.cash.columns.out')}
            </th>
            <th scope="col" className="py-2 ps-3 text-end font-semibold">
              {t('forecasts.cash.columns.net')}
            </th>
            <th scope="col" className="py-2 ps-3 text-end font-semibold">
              {hasBalance
                ? t('forecasts.cash.columns.balance')
                : t('forecasts.cash.columns.runningNet')}
            </th>
          </tr>
        </thead>
        <tbody>
          {forecast.weeks.map((week) => (
            <tr key={week.start} className="break-inside-avoid border-b border-(--border-subtle)">
              <th scope="row" className="py-1.5 text-start font-medium">
                {formatDate(week.start)}
              </th>
              <td className="tabular py-1.5 ps-3 text-end">{formatMoney(week.in.total)}</td>
              <td className="tabular py-1.5 ps-3 text-end">{formatMoney(week.out.total)}</td>
              <td className="tabular py-1.5 ps-3 text-end">{formatMoney(week.net)}</td>
              <td
                className={cn(
                  'tabular py-1.5 ps-3 text-end font-semibold',
                  hasBalance && Number(week.running) < 0 && 'text-(--color-danger)',
                )}
              >
                {formatMoney(week.running)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-(--color-line-strong) font-bold">
            <th scope="row" className="py-2 text-start">
              {t('reports.financing.pnl.total')}
            </th>
            <td className="tabular py-2 ps-3 text-end">{formatMoney(forecast.totals.in)}</td>
            <td className="tabular py-2 ps-3 text-end">{formatMoney(forecast.totals.out)}</td>
            <td className="tabular py-2 ps-3 text-end">{formatMoney(forecast.totals.net)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function CashAssumptions({ assumptions }) {
  const { t } = useI18n();

  const facts = [
    [
      t('forecasts.cash.assumptions.daysToPay'),
      t('forecasts.stock.days', { days: formatNumber(assumptions.median_days_to_pay) }),
    ],
    [
      t('forecasts.cash.assumptions.withinWeek'),
      formatPercent(assumptions.paid_within_week, { decimals: 0 }),
    ],
    [t('forecasts.cash.assumptions.weeklySales'), formatMoney(assumptions.weekly_sales)],
    [
      t('forecasts.cash.assumptions.stockOrders'),
      t('forecasts.cash.assumptions.stockOrdersValue', {
        count: formatNumber(assumptions.stock_orders.count),
        amount: formatMoney(assumptions.stock_orders.total),
      }),
    ],
    [t('reports.financing.cash.overdue'), formatMoney(assumptions.overdue_receivables)],
    ...assumptions.recurring.map((item) => [
      `${item.category} · ${t('forecasts.cash.assumptions.monthlyOn', { day: formatNumber(item.day) })}`,
      formatMoney(item.amount),
    ]),
  ];

  return (
    <div className="break-inside-avoid">
      <h3 className="text-sm font-semibold">{t('forecasts.cash.assumptions.title')}</h3>
      <dl className="mt-2 grid gap-x-8 sm:grid-cols-2">
        {facts.map(([label, value]) => (
          <div
            key={label}
            className="flex items-baseline justify-between gap-4 border-b border-(--border-subtle) py-1.5 text-sm"
          >
            <dt className="text-(--color-text-2)" style={{ unicodeBidi: 'plaintext' }}>
              {label}
            </dt>
            <dd className="tabular font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
