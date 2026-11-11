import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FinancingReportView } from '@/features/reports/FinancingReportView';
import * as reports from '@/services/reports';
import * as pdf from '@/lib/pdf/exportPdf';

vi.mock('@/services/reports', () => ({ financing: vi.fn() }));
vi.mock('@/lib/pdf/exportPdf', () => ({ exportElementToPdf: vi.fn() }));

/*
 * The financing report (phase D3): the document handed to a lender. It
 * shows what the server computed, and says what the figures do not know.
 */

const pnl = (revenue) => ({
  net_revenue: revenue,
  cogs: '100.000',
  gross_profit: '400.000',
  operating_expenses: '150.000',
  net_profit: '250.000',
});

const week = (start) => ({
  start,
  end: start,
  in: { total: '100.000' },
  out: { total: '50.000' },
  net: '50.000',
  running: '50.000',
});

const DATA = {
  business: {
    name: 'Baydar Demo Trading',
    commercial_registration: '1010101010',
    vat_number: null,
    currency: 'BHD',
    decimals: 3,
  },
  prepared_by: 'Ahmed Al Hawajri',
  generated_at: '2026-11-11T10:00:00+03:00',
  period: { from: '2025-11-01', to: '2026-10-31' },
  months: Array.from({ length: 12 }, (_, index) => ({
    month: `2026-${String(index + 1).padStart(2, '0')}`,
    ...pnl('500.000'),
  })),
  totals: { ...pnl('6000.000'), gross_margin: 0.8, net_margin: 0.5, orders: 120 },
  prior: { net_revenue: '0.000', net_profit: '0.000', revenue_growth: null },
  expenses_by_category: [{ category: 'Rent', amount: '1200.000' }],
  position: {
    cash_balance: null,
    cash_balance_as_of: null,
    receivables: '900.000',
    inventory_value: '4000.000',
  },
  cash_forecast: {
    opening_balance: null,
    weeks: [week('2026-11-07'), week('2026-11-14')],
    totals: { in: '200.000', out: '100.000', net: '100.000' },
    lowest: { week: 0, start: '2026-11-07', value: '50.000' },
    first_negative_week: null,
    assumptions: {
      median_days_to_pay: 10,
      paid_within_week: 0.25,
      weekly_sales: '700.000',
      overdue_receivables: '900.000',
      recurring: [],
      stock_orders: { count: 0, total: '0.000' },
    },
  },
  caveats: { zero_cost_items: 3 },
};

function renderView() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <FinancingReportView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(reports.financing).mockReset().mockResolvedValue({ data: DATA });
  vi.mocked(pdf.exportElementToPdf).mockReset().mockResolvedValue(undefined);
});

describe('the financing report', () => {
  it('says who the business is and who prepared it', async () => {
    renderView();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Baydar Demo Trading' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1010101010')).toBeInTheDocument();
    expect(screen.getByText('Ahmed Al Hawajri')).toBeInTheDocument();
  });

  it('lists twelve months of profit and loss with the server\u2019s totals', async () => {
    renderView();

    const table = await screen.findByRole('table', { name: 'Profit and loss, month by month' });
    // A header row, twelve months and the total.
    expect(table.querySelectorAll('tr')).toHaveLength(14);
    expect(table).toHaveTextContent('6,000.000');
  });

  it('says what the figures do not know', async () => {
    renderView();

    expect(
      await screen.findByText(/3 items sold in the period carry no recorded cost/),
    ).toBeInTheDocument();
    expect(screen.getByText(/have not been audited/)).toBeInTheDocument();
    expect(screen.getByText(/The cash balance was not stated/)).toBeInTheDocument();
    expect(screen.getByText('No sales recorded the year before')).toBeInTheDocument();
  });

  it('prints from one button', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Ahmed Al Hawajri');
    await user.click(screen.getByRole('button', { name: 'Print' }));

    expect(print).toHaveBeenCalled();
    expect(vi.mocked(pdf.exportElementToPdf)).not.toHaveBeenCalled();
  });

  it('saves the file from the other, named for the business and the day', async () => {
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Ahmed Al Hawajri');
    await user.click(screen.getByRole('button', { name: /Download PDF/ }));

    const [element, options] = vi.mocked(pdf.exportElementToPdf).mock.calls[0];
    expect(element).toHaveTextContent('Baydar Demo Trading');
    expect(options.filename).toBe('financing-report-baydar-demo-trading-2026-11-11.pdf');
  });

  it('says so when the file cannot be prepared, and points to Print', async () => {
    vi.mocked(pdf.exportElementToPdf).mockRejectedValue(new Error('canvas'));
    const user = userEvent.setup();
    renderView();

    await screen.findByText('Ahmed Al Hawajri');
    await user.click(screen.getByRole('button', { name: /Download PDF/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/use Print/);
  });
});
