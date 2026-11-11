import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CashForecastView } from '@/features/forecasts/CashForecastView';
import * as forecasts from '@/services/forecasts';

vi.mock('@/services/forecasts', () => ({ cash: vi.fn(), setCashBalance: vi.fn() }));

const abilities = { current: ['settings.update'] };

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ can: (ability) => abilities.current.includes(ability) }),
}));

/*
 * The cash forecast (phase D2): whether the money lasts, what the owner must
 * tell it, and what it assumes.
 */

const week = (start, running) => ({
  start,
  end: start,
  in: { receivables: '0.000', sales: '100.000', total: '100.000' },
  out: { recurring: '0.000', other_expenses: '50.000', stock: '0.000', total: '50.000' },
  net: '50.000',
  running,
});

const DATA = {
  generated_for: '2026-11-11',
  opening_balance: null,
  opening_balance_as_of: null,
  weeks: [week('2026-11-07', '50.000'), week('2026-11-14', '100.000')],
  totals: { in: '200.000', out: '100.000', net: '100.000' },
  lowest: { week: 0, start: '2026-11-07', value: '50.000' },
  first_negative_week: null,
  assumptions: {
    median_days_to_pay: 10,
    paid_within_week: 0.25,
    weekly_sales: '700.000',
    overdue_receivables: '900.000',
    recurring: [{ category: 'Rent', amount: '2000.000', day: 4 }],
    stock_orders: { count: 2, total: '300.000' },
  },
};

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <CashForecastView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  // jsdom has no matchMedia; the chart asks it whether to animate.
  window.matchMedia ??= () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
  abilities.current = ['settings.update'];
  vi.mocked(forecasts.cash).mockReset().mockResolvedValue({ data: DATA });
  vi.mocked(forecasts.setCashBalance).mockReset().mockResolvedValue({ data: {} });
});

describe('the cash forecast', () => {
  it('without a balance, says the line is a shape, not a level', async () => {
    renderView();

    expect(await screen.findByText(/the net flow from zero/)).toBeInTheDocument();
    expect(screen.getByText('Lowest running net')).toBeInTheDocument();
  });

  it('names the week the money runs out', async () => {
    vi.mocked(forecasts.cash).mockResolvedValue({
      data: {
        ...DATA,
        opening_balance: '100.000',
        opening_balance_as_of: '2026-11-10',
        first_negative_week: { week: 1, start: '2026-11-14' },
      },
    });
    renderView();

    expect(await screen.findByText(/cash runs out in the week of/)).toBeInTheDocument();
  });

  it('shows overdue money beside the forecast, and says it is not counted', async () => {
    renderView();

    expect(
      await screen.findByText(/past the day they usually pay. It is not in the forecast/),
    ).toBeInTheDocument();
  });

  it('lists what it assumes, recurring expenses included', async () => {
    renderView();

    expect(await screen.findByText('Rent')).toBeInTheDocument();
    expect(screen.getByText('Monthly, around day 4')).toBeInTheDocument();
    expect(screen.getByText('10 days')).toBeInTheDocument();
    expect(screen.getByText(/VAT settlements/)).toBeInTheDocument();
  });

  it('lets an owner state the balance', async () => {
    const user = userEvent.setup();
    renderView();

    const field = await screen.findByLabelText('Balance');
    await user.type(field, '25000');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(vi.mocked(forecasts.setCashBalance).mock.calls[0][0]).toEqual({
      amount: '25000',
      as_of: '2026-11-11',
    });
  });

  it('offers no balance form to a role that may not change settings', async () => {
    abilities.current = [];
    renderView();

    await screen.findByText('Rent');
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
