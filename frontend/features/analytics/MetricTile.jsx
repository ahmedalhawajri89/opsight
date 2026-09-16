'use client';

import { StatTile } from '@/components/data/StatTile';
import { formatMoney, formatNumber, formatPercent } from '@/lib/format';

/**
 * Renders one metric from the API's payload.
 *
 * Every presentation decision comes from the SERVER: the value, the comparison,
 * the format, the empty reason, and crucially the FAVOURABLE DIRECTION.
 *
 * The client does not decide that expenses rising is bad news. It reads
 * `favourable: "down"` from the payload and colours accordingly — because the
 * alternative is a second copy of that judgement in JavaScript, and the two
 * would eventually disagree about some metric nobody re-checked.
 */

/** Plain-language definitions, taken from docs/database/METRICS.md §2. */
const DEFINITIONS = {
  net_revenue:
    'Subtotal less discounts and refunds, for orders placed in this period. Excludes tax and shipping.',
  gross_revenue: 'Total value of goods sold, before discounts, tax, shipping and refunds.',
  orders_count: 'Orders committed in this period. Drafts and cancellations are excluded.',
  units_sold: 'Total item quantity sold. Not reduced by refunds.',
  average_order_value: 'Net revenue divided by the number of orders.',
  cogs: 'What the business paid for the goods sold, using the cost recorded at the moment of sale.',
  gross_profit: 'Net revenue less cost of goods.',
  gross_margin: 'Gross profit as a proportion of net revenue.',
  operating_expenses:
    'Running costs incurred in this period. Excludes cost of goods, which is counted separately.',
  net_profit: 'Gross profit less operating expenses. An operating figure, not a statutory one.',
  net_margin: 'Net profit as a proportion of net revenue.',
  cancellation_rate:
    'Cancelled orders as a share of all orders placed. The denominator includes cancellations.',
  refund_rate: 'Refunded value as a share of gross revenue.',
  new_customers:
    'Customers whose first ever order falls in this period. Walk-in trade is excluded.',
  returning_customers: 'Customers who ordered in this period and had ordered before it.',
};

const LABELS = {
  net_revenue: 'Net revenue',
  gross_revenue: 'Gross revenue',
  orders_count: 'Orders',
  units_sold: 'Units sold',
  average_order_value: 'Average order value',
  cogs: 'Cost of goods',
  gross_profit: 'Gross profit',
  gross_margin: 'Gross margin',
  operating_expenses: 'Operating expenses',
  net_profit: 'Operating profit',
  net_margin: 'Net margin',
  cancellation_rate: 'Cancellation rate',
  refund_rate: 'Refund rate',
  new_customers: 'New customers',
  returning_customers: 'Returning customers',
};

export function MetricTile({
  metricKey,
  metric,
  currency,
  decimals,
  comparisonLabel,
  partial,
  loading,
}) {
  if (loading) {
    return <StatTile label={LABELS[metricKey] ?? metricKey} loading />;
  }

  if (!metric) return null;

  const present = (value) => {
    if (value === null || value === undefined) return null;

    return metric.format === 'money'
      ? formatMoney(value, { currency, decimals })
      : metric.format === 'ratio'
        ? formatPercent(value)
        : formatNumber(value);
  };

  const isRatio = metric.format === 'ratio';

  /*
   * For a RATIO, the meaningful change is the difference in PERCENTAGE POINTS,
   * which is `change_absolute` — not `change_pct`.
   *
   * A margin moving 38.4% to 34.2% has change_absolute -0.042 (that is -4.2 pp)
   * and change_pct -0.1063 (it fell by 10.6% of itself). Showing the second
   * with a "pp" label states a number that is both wrong and confidently
   * labelled, which is worse than showing nothing (METRICS.md §1.6).
   */
  const change = isRatio ? metric.change_absolute : metric.change_pct;

  return (
    <StatTile
      label={LABELS[metricKey] ?? metricKey}
      value={present(metric.value)}
      definition={DEFINITIONS[metricKey]}
      change={change}
      changeFormat={isRatio ? 'points' : 'percent'}
      favourable={metric.favourable}
      comparisonBasis={comparisonLabel}
      previousLabel={metric.previous !== null ? present(metric.previous) : undefined}
      partial={partial}
      emptyReason={metric.empty_reason}
    />
  );
}
