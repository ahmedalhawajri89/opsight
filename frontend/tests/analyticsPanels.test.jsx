import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, it } from 'vitest';

import { sumAmounts } from '@/components/charts/CashFlowChart';
import { QuickStatsCard } from '@/features/analytics/DashboardPanels';

/*
 * The two panels under the ranking on the analytics screen, redesigned:
 * business performance gains its totals, quick stats became linked tiles.
 */

describe('business performance totals', () => {
  it('adds decimal amounts exactly, never through floats', () => {
    // 0.1 + 0.2 as floats is 0.30000000000000004.
    expect(sumAmounts(['0.1', '0.2'])).toBe('0.3000');
    expect(sumAmounts(['152777.945', '24952.140', null])).toBe('177730.0850');
    expect(sumAmounts(['-10.5', '4.25'])).toBe('-6.2500');
  });
});

describe('quick stats', () => {
  const stats = {
    products: { value: 40, change: 0.05 },
    receivables: { value: '152777.945', change: null },
  };

  it('makes each stat a way into its own screen', () => {
    render(<QuickStatsCard stats={stats} currency="BHD" />);

    expect(screen.getByRole('link', { name: /Total Products/ })).toHaveAttribute('href', '/products');
    expect(screen.getByRole('link', { name: /Owed by customers/ })).toHaveAttribute('href', '/orders');
  });

  it('shows a change only where one honestly exists', () => {
    render(<QuickStatsCard stats={stats} currency="BHD" />);

    expect(screen.getByRole('link', { name: /Total Products/ })).toHaveTextContent('5.0%');
    expect(screen.getByRole('link', { name: /Owed by customers/ })).not.toHaveTextContent('%');
  });

  it('keeps the exact amount behind the compact one', () => {
    render(<QuickStatsCard stats={stats} currency="BHD" />);

    expect(screen.getByRole('link', { name: /Owed by customers/ }).getAttribute('title')).toContain('152,777.945');
  });

  it('shows only the stats the role was sent', () => {
    render(<QuickStatsCard stats={stats} currency="BHD" />);

    expect(screen.queryByText('Active Users')).not.toBeInTheDocument();
  });
});

describe('from revenue to profit', () => {
  const steps = (net) => [
    { key: 'net_revenue', kind: 'total', label: 'Net revenue', value: '1000.000' },
    { key: 'cogs', kind: 'down', label: 'Cost of goods', value: '600.000' },
    { key: 'gross_profit', kind: 'total', label: 'Gross profit', value: '400.000' },
    { key: 'operating_expenses', kind: 'down', label: 'Operating expenses', value: String(400 - net) },
    { key: 'net_profit', kind: 'total', label: 'Net profit', value: String(net) },
  ];

  it('writes the arithmetic out, with each subtotal\'s margin', async () => {
    const { WaterfallChart } = await import('@/components/charts/WaterfallChart');
    render(<WaterfallChart title="From revenue to profit" steps={steps(100)} margins={{ gross_profit: 0.4, net_profit: 0.1 }} currency="BHD" />);

    expect(screen.getAllByText('Gross profit').length).toBeGreaterThan(0);
    expect(screen.getByText('Margin 40.0%')).toBeInTheDocument();
    expect(screen.getByText('Margin 10.0%')).toBeInTheDocument();
    // Cost of goods took 60%, running costs 30%, 10% was left.
    expect(screen.getByText('Where the revenue went')).toBeInTheDocument();
    expect(screen.getAllByText('60.0%').length).toBeGreaterThan(0);
  });

  it('shows a loss as costs running past revenue', async () => {
    const { WaterfallChart } = await import('@/components/charts/WaterfallChart');
    render(<WaterfallChart title="From revenue to profit" steps={steps(-50)} currency="BHD" />);

    expect(screen.getByText('Costs ran 5.0% past revenue')).toBeInTheDocument();
  });
});

describe('the trend summary', () => {
  // jsdom has no matchMedia; the chart asks it whether to animate.
  beforeAll(() => {
    window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  });

  const series = [
    { bucket: '2026-08-01', bucket_end: '2026-08-31', value: '100.000', is_partial: false },
    { bucket: '2026-09-01', bucket_end: '2026-09-30', value: '300.000', is_partial: false },
    { bucket: '2026-10-01', bucket_end: '2026-10-31', value: '150.000', is_partial: false },
    { bucket: '2026-11-01', bucket_end: '2026-11-30', value: '900.000', is_partial: true },
  ];

  it('totals the period exactly, and leaves the unfinished bucket out of highest and latest', async () => {
    const { TrendChart } = await import('@/components/charts/TrendChart');
    render(<TrendChart title="Net revenue" series={series} currency="BHD" summary />);

    expect(screen.getByText('Total for the period')).toBeInTheDocument();
    expect(screen.getAllByText(/1,450\.000/).length).toBeGreaterThan(0);
    // November is still filling: 900 is not the "highest", September's 300 is.
    expect(screen.getAllByText(/300\.000/).length).toBeGreaterThan(0);
    expect(screen.getByText(/down 50\.0% on the one before/)).toBeInTheDocument();
  });

  it('stays off unless asked for', async () => {
    const { TrendChart } = await import('@/components/charts/TrendChart');
    render(<TrendChart title="Net revenue" series={series} currency="BHD" />);

    expect(screen.queryByText('Total for the period')).not.toBeInTheDocument();
  });
});
