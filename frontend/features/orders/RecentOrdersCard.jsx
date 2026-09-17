'use client';

import Link from 'next/link';

import { useOrders } from '@/features/orders/useOrders';
import { Card } from '@/components/layout/PageHeader';
import { OrderStatusBadge } from '@/components/ui/Badge';
import { ViewAll } from '@/features/analytics/DashboardPanels';
import { formatMoney, formatShortDate } from '@/lib/format';
import { useI18n } from '@/features/i18n/I18nProvider';

/*
 * The five most recently placed orders.
 *
 * Read through the ordinary orders list endpoint, with its own policy and its
 * own resource redaction — this panel adds no API surface and cannot show a
 * figure the Orders screen would not. It is deliberately NOT tied to the
 * selected period: "what just happened" is an operational question, and a
 * period ending last March would otherwise leave it showing last March.
 */
const QUERY = { page: 1, per_page: 5, sort: '-placed_at' };

/**
 * The reference, shortened to its sequence for a narrow column: "#002405" for
 * ORD-2026-002405. The full reference is the link's accessible name and
 * tooltip, so nothing is lost — it is only not repeated in the column.
 */
function shortReference(reference = '') {
  const tail = String(reference).split('-').pop();

  return tail ? `#${tail}` : reference;
}

export function RecentOrdersCard({ currency, decimals, className, style }) {
  const { t } = useI18n();
  const { orders, isLoading } = useOrders(QUERY);

  return (
    <Card
      title={t('dashboard.recentOrders.title')}
      icon="orders"
      padded={false}
      className={className}
      style={style}
      actions={<ViewAll href="/orders" label={t('common.viewAll')} />}
    >
      {isLoading ? (
        <div className="space-y-3 px-5 py-4" aria-busy="true">
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="skeleton h-4 rounded-(--radius-sm)" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <p className="px-5 pb-5 text-[0.8125rem] text-(--color-text-muted)">
          {t('dashboard.recentOrders.empty')}
        </p>
      ) : (
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full text-xs">
            <caption className="sr-only">{t('dashboard.recentOrders.title')}</caption>
            <thead>
              <tr className="border-b border-(--color-line-subtle) text-[0.6875rem] text-(--color-text-muted)">
                <th scope="col" className="px-2 py-2 text-start font-medium">
                  #
                </th>
                <th scope="col" className="px-2 py-2 text-start font-medium">
                  {t('dashboard.recentOrders.customer')}
                </th>
                <th scope="col" className="px-2 py-2 text-start font-medium">
                  {t('dashboard.recentOrders.date')}
                </th>
                <th scope="col" className="px-2 py-2 text-start font-medium">
                  {t('dashboard.recentOrders.status')}
                </th>
                <th scope="col" className="px-2 py-2 text-end font-medium">
                  {t('dashboard.recentOrders.total')}
                </th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr
                  key={order.id}
                  className="transition-colors duration-150 hover:bg-(--color-surface-sunken)"
                >
                  <td className="px-2 py-2">
                    <Link
                      href={`/orders/${order.id}`}
                      aria-label={order.reference}
                      title={order.reference}
                      className="tabular font-medium whitespace-nowrap text-(--color-text) hover:text-(--color-accent-text) hover:underline"
                    >
                      {shortReference(order.reference)}
                    </Link>
                  </td>
                  <td className="px-2 py-2">
                    <span className="block max-w-[6.5rem] truncate text-(--color-text)">
                      {order.customer?.name ?? (
                        <span className="text-(--color-text-muted)">{t('common.walkIn')}</span>
                      )}
                    </span>
                  </td>
                  <td className="tabular px-2 py-2 whitespace-nowrap text-(--color-text-muted)">
                    {order.placed_at ? formatShortDate(order.placed_at) : '—'}
                  </td>
                  <td className="px-2 py-2">
                    <OrderStatusBadge status={order.status} />
                  </td>
                  <td className="tabular px-2 py-2 text-end whitespace-nowrap text-(--color-text)">
                    {formatMoney(order.total_amount, { currency, decimals })}
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
