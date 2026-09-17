'use client';

import { StatTile } from '@/components/data/StatTile';
import { useI18n } from '@/features/i18n/I18nProvider';
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

/*
 * Metric names and their plain-language definitions (docs/database/METRICS.md
 * §2) live in the dictionaries under `metrics.<key>`, so a definition is read in
 * the reader's language — a financial definition is exactly the text that must
 * not be left in English.
 */
const KNOWN_METRICS = [
  'net_revenue',
  'gross_revenue',
  'orders_count',
  'units_sold',
  'average_order_value',
  'cogs',
  'gross_profit',
  'gross_margin',
  'operating_expenses',
  'net_profit',
  'net_margin',
  'cancellation_rate',
  'refund_rate',
  'new_customers',
  'returning_customers',
];

export function metricLabel(t, key) {
  return KNOWN_METRICS.includes(key) ? t(`metrics.${key}.label`) : key;
}

export function metricDefinition(t, key) {
  return KNOWN_METRICS.includes(key) ? t(`metrics.${key}.definition`) : undefined;
}

/**
 * How one metric is shown: formatted value and previous value, and which change
 * to display.
 *
 * Shared by MetricTile and the dashboard KPI band, so the ratio rule below has
 * one implementation. Two components each deciding "points or percent" is how
 * one of them ends up printing a margin change as a percentage.
 */
export function presentMetric(metric, { currency, decimals }) {
  const format = (value) => {
    if (value === null || value === undefined) return null;

    return metric.format === 'money'
      ? formatMoney(value, { currency, decimals })
      : metric.format === 'ratio'
        ? formatPercent(value)
        : formatNumber(value);
  };

  const isRatio = metric.format === 'ratio';

  return {
    value: format(metric.value),
    previous: metric.previous !== null ? format(metric.previous) : undefined,
    /*
     * For a RATIO, the meaningful change is the difference in PERCENTAGE
     * POINTS, which is `change_absolute` — not `change_pct`.
     *
     * A margin moving 38.4% to 34.2% has change_absolute -0.042 (that is
     * -4.2 pp) and change_pct -0.1063 (it fell by 10.6% of itself). Showing the
     * second with a "pp" label states a number that is both wrong and
     * confidently labelled, which is worse than showing nothing
     * (METRICS.md §1.6).
     */
    change: isRatio ? metric.change_absolute : metric.change_pct,
    changeFormat: isRatio ? 'points' : 'percent',
  };
}

export function MetricTile({
  metricKey,
  metric,
  currency,
  decimals,
  comparisonLabel,
  partial,
  loading,
}) {
  const { t } = useI18n();

  if (loading) {
    return <StatTile label={metricLabel(t, metricKey)} loading />;
  }

  if (!metric) return null;

  const shown = presentMetric(metric, { currency, decimals });

  return (
    <StatTile
      label={metricLabel(t, metricKey)}
      value={shown.value}
      definition={metricDefinition(t, metricKey)}
      change={shown.change}
      changeFormat={shown.changeFormat}
      favourable={metric.favourable}
      comparisonBasis={comparisonLabel}
      previousLabel={shown.previous}
      partial={partial}
      emptyReason={metric.empty_reason}
    />
  );
}
