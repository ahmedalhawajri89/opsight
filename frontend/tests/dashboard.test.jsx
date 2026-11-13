import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChannelMix } from '@/features/dashboard/ChannelMix';
import { DashboardTabs } from '@/features/dashboard/DashboardTabs';
import { ProfitBreakdown } from '@/features/dashboard/ProfitBreakdown';
import { StockRunway } from '@/features/dashboard/StockRunway';
import { WeekActions } from '@/features/dashboard/WeekActions';

/*
|--------------------------------------------------------------------------
| The dashboard, rebuilt as four bands
|--------------------------------------------------------------------------
*/

// jsdom has no matchMedia; the tabs ask it whether the reader wants less motion.
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onchange: null,
  }));
});

describe('What to do this week', () => {
  const insight = (id) => ({
    id,
    severity: 'action',
    title: `Insight ${id}`,
    message: 'Something to do.',
    link: { href: '/inventory' },
  });

  it('shows the first three the server ranked, and links to all of them', () => {
    render(
      <WeekActions
        insights={[insight('a'), insight('b'), insight('c'), insight('d'), insight('e')]}
        viewAllHref="/analytics"
      />,
    );

    expect(screen.getByText('Insight a')).toBeInTheDocument();
    expect(screen.getByText('Insight c')).toBeInTheDocument();
    expect(screen.queryByText('Insight d')).toBeNull();
    expect(screen.getByRole('link', { name: /All alerts \(5\)/ })).toHaveAttribute(
      'href',
      '/analytics',
    );
  });

  it('gives each card its next step as a link to the evidence', () => {
    render(<WeekActions insights={[insight('a')]} />);

    expect(screen.getByRole('link', { name: /Check inventory/ })).toHaveAttribute(
      'href',
      '/inventory',
    );
  });

  it('says so when nothing crossed a threshold, rather than leaving a blank', () => {
    render(<WeekActions insights={[]} />);

    expect(
      screen.getByText('Nothing in this period crossed a reporting threshold.'),
    ).toBeInTheDocument();
  });
});

describe('sales by channel', () => {
  const channels = [
    { key: 'salla', orders: 3, revenue: '300.000', share: 0.6, gross_margin: 0.3 },
    { key: 'manual', orders: 2, revenue: '200.000', share: 0.4, gross_margin: 0.45 },
  ];

  it('names each source with its revenue, and the best margin for a role that sees cost', () => {
    render(<ChannelMix channels={channels} canSeeCost currency="BHD" decimals={3} />);

    expect(screen.getByText('Salla')).toBeInTheDocument();
    expect(screen.getByText('Entered by hand')).toBeInTheDocument();
    expect(screen.getByText(/Highest margin: Entered by hand/)).toBeInTheDocument();
  });

  it('shows no margin at all to a role that cannot see cost', () => {
    const sales = channels.map(({ gross_margin: _unused, ...rest }) => rest);

    render(<ChannelMix channels={sales} canSeeCost={false} currency="BHD" decimals={3} />);

    expect(screen.queryByText(/Margin/)).toBeNull();
    expect(screen.getByText('Where do your sales come from?')).toBeInTheDocument();
  });
});

describe('when stock runs out', () => {
  it('lists the products closest to running out first, at most five', () => {
    const item = (id, days) => ({
      product_id: id,
      name: `Product ${id}`,
      stock: 5,
      daily_rate: 1,
      days_left: days,
      run_out_on: days === null ? null : '2026-12-01',
      status: days !== null && days < 7 ? 'order_now' : 'ok',
    });

    render(
      <StockRunway
        data={{
          cover_days: 30,
          items: [item(1, 40), item(2, 2), item(3, null), item(4, 10), item(5, 20), item(6, 30)],
        }}
      />,
    );

    const rows = screen.getAllByRole('row').slice(1);

    expect(rows).toHaveLength(5);
    expect(rows[0]).toHaveTextContent('Product 2');
    expect(screen.queryByText('Product 3')).toBeNull();
  });
});

describe('did you make a profit', () => {
  it('reads revenue down to net profit from the server, and names the remainder', () => {
    const metric = (value) => ({ value, format: 'money' });

    render(
      <ProfitBreakdown
        metrics={{
          net_revenue: metric('1000.000'),
          cogs: metric('400.000'),
          operating_expenses: metric('300.000'),
          net_profit: metric('300.000'),
        }}
        expenses={{
          rows: [
            { label: 'Rent', value: '200.000', is_other: false },
            { label: null, count: 2, value: '100.000', is_other: true },
          ],
        }}
        currency="BHD"
        decimals={3}
      />,
    );

    expect(screen.getByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Other items (2)')).toBeInTheDocument();
    expect(screen.getAllByText('Profit').length).toBeGreaterThan(0);
  });
});

describe('the dashboard tabs', () => {
  const tabs = [
    { id: 'orders', label: 'Orders', icon: 'orders', render: () => <p>orders list</p> },
    { id: 'products', label: 'Best sellers', icon: 'star', render: () => <p>products list</p> },
    { id: 'stock', label: 'Stock', icon: 'shelves', render: () => <p>stock list</p> },
  ];

  it('opens on the first list and shows one list at a time', () => {
    render(<DashboardTabs tabs={tabs} label="Lists" />);

    expect(screen.getByRole('tab', { name: /Orders/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('orders list')).toBeInTheDocument();
    expect(screen.queryByText('products list')).toBeNull();
  });

  it('keeps only the selected tab in the tab order, and moves with the arrow keys', async () => {
    const user = userEvent.setup();
    render(<DashboardTabs tabs={tabs} label="Lists" />);

    expect(screen.getByRole('tab', { name: /Best sellers/ })).toHaveAttribute('tabindex', '-1');

    await user.click(screen.getByRole('tab', { name: /Orders/ }));
    await user.keyboard('{ArrowRight}');

    expect(screen.getByRole('tab', { name: /Best sellers/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('tab', { name: /Best sellers/ })).toHaveFocus();
    expect(screen.getByText('products list')).toBeInTheDocument();

    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: /Stock/ })).toHaveAttribute('aria-selected', 'true');

    // Past the last tab, round to the first.
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: /Orders/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('ties each panel to its tab for assistive technology', () => {
    render(<DashboardTabs tabs={tabs} label="Lists" />);

    const tab = screen.getByRole('tab', { name: /Orders/ });
    const panel = screen.getByRole('tabpanel');

    expect(panel).toHaveAttribute('aria-labelledby', tab.id);
    expect(tab).toHaveAttribute('aria-controls', panel.id);
  });
});
