import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StockForecastView } from '@/features/forecasts/StockForecastView';
import * as forecasts from '@/services/forecasts';

vi.mock('@/services/forecasts', () => ({ stock: vi.fn() }));

/*
 * The stock forecast screen (phase D1): how urgent, how trustworthy, and
 * the two assumptions the owner can change.
 */

const item = (overrides) => ({
  product_id: 1,
  name: 'Whiteboard',
  sku: 'WB-1',
  unit: 'piece',
  stock: 0,
  daily_rate: 1,
  weekly_units: [7, 7, 7, 7, 7, 7, 0, 0],
  days_left: 0,
  run_out_on: '2026-11-11',
  order_by: '2026-11-11',
  suggested_quantity: 37,
  suggested_cost: '148.000',
  confidence: 'high',
  status: 'out',
  ...overrides,
});

const RESPONSE = {
  data: {
    generated_for: '2026-11-11',
    lead_time_days: 7,
    cover_days: 30,
    accuracy: 0.5,
    counts: { out: 1, order_now: 0, soon: 0, ok: 1 },
    items: [
      item(),
      item({
        product_id: 2,
        name: 'Headset',
        sku: 'HS-1',
        stock: 18,
        status: 'ok',
        order_by: '2026-11-30',
        confidence: 'medium',
      }),
    ],
  },
};

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <StockForecastView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(forecasts.stock).mockReset().mockResolvedValue(RESPONSE);
});

describe('the stock forecast', () => {
  it('says how far to trust it, in a sentence', async () => {
    renderView();

    expect(
      await screen.findByText('Over the last four weeks, this forecast was 50% accurate.'),
    ).toBeInTheDocument();
  });

  it('lists the most urgent first, with what to order and what it costs', async () => {
    renderView();

    const rows = await screen.findAllByRole('row');

    expect(rows[1]).toHaveTextContent('Whiteboard');
    expect(rows[1]).toHaveTextContent('Out of stock');
    expect(rows[1]).toHaveTextContent('37');
    expect(rows[1]).toHaveTextContent('148.000');
  });

  it('narrows the list to one status from its card, and back', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findAllByText('Headset');
    const covered = screen.getByRole('button', { name: /Covered/ });

    await user.click(covered);
    expect(screen.queryAllByText('Whiteboard')).toHaveLength(0);
    expect(covered).toHaveAttribute('aria-pressed', 'true');

    await user.click(covered);
    expect(screen.getAllByText('Whiteboard').length).toBeGreaterThan(0);
  });

  it('asks again with the supplier lead time the owner sets', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findAllByText('Headset');
    await user.selectOptions(screen.getByLabelText('Supplier lead time'), '14');

    expect(vi.mocked(forecasts.stock)).toHaveBeenLastCalledWith({ lead_time: 14, cover_days: 30 });
  });

  it('says plainly when there is not enough history to test it', async () => {
    vi.mocked(forecasts.stock).mockResolvedValue({ data: { ...RESPONSE.data, accuracy: null } });
    renderView();

    expect(await screen.findByText(/Not enough sales yet/)).toBeInTheDocument();
  });

  it('shows the count of each status on its card', async () => {
    renderView();

    // Wait for the data, then read the card: "—" stands in until it arrives.
    await screen.findAllByText('Headset');
    const out = screen.getByRole('button', { name: /Out of stock/ });

    expect(within(out).getByText('1')).toBeInTheDocument();
  });
});
