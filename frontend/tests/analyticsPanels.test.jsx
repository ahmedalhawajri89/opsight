import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
