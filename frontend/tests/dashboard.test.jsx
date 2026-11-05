import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AttentionStrip } from '@/features/dashboard/AttentionStrip';
import { DashboardTabs } from '@/features/dashboard/DashboardTabs';
import { trendPath } from '@/features/dashboard/DashboardHero';

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

describe('the line across the band', () => {
  it('draws nothing from fewer than two points', () => {
    // One bucket is a dot, not a shape, and no data is not a flat line.
    expect(trendPath([])).toBeNull();
    expect(trendPath([{ value: '120.000' }])).toBeNull();
    expect(trendPath(undefined)).toBeNull();
  });

  it('runs edge to edge through every point and closes its area at the foot', () => {
    const line = trendPath([{ value: '10' }, { value: '30' }, { value: '20' }]);

    expect(line.stroke.startsWith('M0.0 ')).toBe(true);
    expect(line.stroke.trim().endsWith('1000.0 61.0')).toBe(true);
    expect(line.area.endsWith('L1000 100L0 100Z')).toBe(true);
  });

  it('draws a flat period as a flat line rather than dividing by nothing', () => {
    const line = trendPath([{ value: '5' }, { value: '5' }]);

    expect(line.stroke).not.toContain('NaN');
  });
});

describe('Needs your attention', () => {
  const insight = (id) => ({
    id,
    severity: 'action',
    title: `Insight ${id}`,
    message: 'Something to do.',
    link: { href: '/inventory' },
  });

  it('shows the first three the server ranked, and counts the rest', () => {
    render(
      <AttentionStrip
        insights={[insight('a'), insight('b'), insight('c'), insight('d'), insight('e')]}
        viewAllHref="/analytics"
      />,
    );

    expect(screen.getByText('Insight a')).toBeInTheDocument();
    expect(screen.getByText('Insight c')).toBeInTheDocument();
    expect(screen.queryByText('Insight d')).toBeNull();
    expect(screen.getByRole('link', { name: /2 more/ })).toHaveAttribute('href', '/analytics');
  });

  it('gives each card its next step as a link to the evidence', () => {
    render(<AttentionStrip insights={[insight('a')]} />);

    expect(screen.getByRole('link', { name: /Check inventory/ })).toHaveAttribute(
      'href',
      '/inventory',
    );
  });

  it('says so when nothing crossed a threshold, rather than leaving a blank', () => {
    render(<AttentionStrip insights={[]} />);

    expect(
      screen.getByText('Nothing in this period crossed a reporting threshold.'),
    ).toBeInTheDocument();
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
