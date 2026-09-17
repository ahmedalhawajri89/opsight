'use client';

import Link from 'next/link';

import { Badge, PartialBadge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/layout/PageHeader';
import { cn } from '@/lib/cn';
import { EMPTY, formatMoney, formatNumber, formatPercent } from '@/lib/format';

/**
 * The period status line.
 *
 * An in-progress period compared against a complete one is the single most
 * common way a dashboard misleads: on the 2nd of the month every figure looks
 * like a collapse. That warning must be on the page — but once, as context,
 * rather than as an amber alarm and a badge on every one of twelve tiles, which
 * is how it was before and which trained the eye to skip it.
 */
export function PeriodStatus({ show }) {
  if (!show) return null;

  return (
    <p
      role="status"
      className="mb-5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-(--radius-lg) border border-(--color-line) bg-(--color-surface) px-4 py-2.5 text-[0.8125rem] text-(--color-text-muted) shadow-(--shadow-card)"
    >
      <Icon name="clock" className="shrink-0 text-(--color-warning)" />
      <PartialBadge />
      <span>
        This period is still in progress, so it is being compared against a complete one. Expect
        figures to read low until it finishes.
      </span>
    </p>
  );
}

/**
 * Top products — as a ranked table rather than a bar chart.
 *
 * The chart this replaces spent most of its width on axis labels, truncated
 * product names, and drew "Other" as by far the longest bar, so the one thing
 * it was for — which products lead — was the hardest thing to read off it. A
 * table gives the name its full width, keeps the exact figure, and a share bar
 * inside the row still shows proportion at a glance.
 *
 * The share is the SERVER's, and null on a zero total: a share of nothing is
 * undefined, not zero, and renders as an em dash.
 */
export function TopProductsCard({ rows = [], currency, decimals, loading, className }) {
  return (
    <Card
      title="Top products"
      description="By net revenue, grouped by the SKU recorded at the time of sale"
      padded={false}
      className={className}
    >
      {loading ? (
        <RowsSkeleton />
      ) : rows.length === 0 ? (
        <p className="px-5 py-6 text-[0.8125rem] text-(--color-text-muted)">
          Nothing was sold in this period, so there is nothing to rank.
        </p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">Top products by net revenue</caption>
          <thead>
            <tr className="text-[0.6875rem] tracking-[0.05em] text-(--color-text-muted) uppercase">
              <th scope="col" className="w-8 py-2.5 ps-5 text-start font-medium">
                #
              </th>
              <th scope="col" className="py-2.5 text-start font-medium">
                Product
              </th>
              <th scope="col" className="py-2.5 pe-5 text-end font-medium">
                Revenue
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr
                key={row.key}
                className="border-t border-(--color-line-subtle) transition-colors duration-150 hover:bg-(--color-surface-hover)/70"
              >
                <td className="tabular py-2.5 ps-5 align-top text-xs text-(--color-text-subtle)">
                  {row.is_other ? '' : index + 1}
                </td>
                <td className="py-2.5 pe-4 align-top">
                  <div className="flex items-baseline justify-between gap-3">
                    <span
                      className={cn(
                        'truncate',
                        row.is_other ? 'text-(--color-text-muted)' : 'text-(--color-text)',
                      )}
                    >
                      {row.label}
                      {row.sublabel && (
                        <span className="ms-1.5 text-xs text-(--color-text-subtle)">
                          {row.sublabel}
                        </span>
                      )}
                    </span>
                    <span className="tabular shrink-0 text-xs text-(--color-text-muted)">
                      {row.share === null ? EMPTY : formatPercent(row.share)}
                    </span>
                  </div>
                  <ShareBar share={row.share} muted={row.is_other} />
                </td>
                <td className="tabular py-2.5 pe-5 text-end align-top font-medium whitespace-nowrap text-(--color-text)">
                  {formatMoney(row.value, { currency, decimals })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function ShareBar({ share, muted }) {
  if (share === null || share === undefined) return null;

  return (
    <div
      aria-hidden="true"
      className="mt-1.5 h-1 overflow-hidden rounded-full bg-(--color-surface-hover)"
    >
      <div
        className={cn(
          'h-full rounded-full',
          muted ? 'bg-(--color-series-6)' : 'bg-(--color-series-2)',
        )}
        style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
      />
    </div>
  );
}

/**
 * Low stock.
 *
 * A POINT-IN-TIME figure: it reflects now, not the selected period, and says so
 * — otherwise a reader takes it as "low stock during August" (METRICS.md §2.18).
 */
export function LowStockCard({ data, loading, className }) {
  const items = data?.items ?? [];

  return (
    <Card
      title="Low stock"
      description="As of now — not for the selected period"
      padded={false}
      className={cn('flex flex-col', className)}
      bodyClassName="flex flex-1 flex-col"
      actions={
        data?.count > 0 ? (
          <Badge tone="warning">{formatNumber(data.count)} below reorder point</Badge>
        ) : null
      }
    >
      {loading ? (
        <RowsSkeleton />
      ) : items.length === 0 ? (
        <p className="flex flex-1 items-start gap-2.5 px-5 py-5 text-[0.8125rem] text-(--color-text-muted)">
          <Icon name="check" className="mt-0.5 shrink-0 text-(--color-positive)" />
          Nothing is at or below its reorder point.
        </p>
      ) : (
        <ul className="flex-1">
          {items.map((item) => (
            <li
              key={item.product_id}
              className="border-t border-(--color-line-subtle) px-5 py-3 first:border-t-0"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-(--color-text)">{item.product?.name}</p>
                  <p className="font-mono text-[0.6875rem] text-(--color-text-subtle)">
                    {item.product?.sku}
                  </p>
                </div>
                <p className="tabular shrink-0 text-end text-sm">
                  <span className="font-semibold text-(--color-warning)">
                    {formatNumber(item.stock_on_hand)}
                  </span>
                  <span className="text-(--color-text-muted)"> left</span>
                </p>
              </div>
              {item.threshold > 0 && (
                <p className="tabular mt-0.5 text-xs text-(--color-text-subtle)">
                  Reorder point {formatNumber(item.threshold)}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-(--color-line-subtle) px-5 py-3">
        <Link
          href="/inventory?low_stock=true"
          className="group inline-flex items-center gap-1 text-[0.8125rem] font-medium text-(--color-accent-text) hover:underline"
        >
          View all inventory
          <Icon
            name="arrowRight"
            size={14}
            className="transition-transform duration-150 group-hover:translate-x-0.5 rtl:-scale-x-100"
          />
        </Link>
      </div>
    </Card>
  );
}

function RowsSkeleton() {
  return (
    <div className="space-y-3 px-5 py-4" aria-busy="true">
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="skeleton h-4 rounded-(--radius-sm)" />
      ))}
    </div>
  );
}
