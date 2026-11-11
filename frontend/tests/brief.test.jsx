import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BriefSettings } from '@/features/brief/BriefSettings';
import * as briefService from '@/services/brief';

vi.mock('@/services/brief', () => ({
  getBrief: vi.fn(),
  sendTestBrief: vi.fn(),
  updateBriefSettings: vi.fn(),
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ replaceUser: vi.fn() }),
}));

/*
 * The morning brief's settings (phase C). The preview is the argument: the
 * owner decides on what today's brief actually says.
 */

const BRIEF = {
  data: {
    enabled: false,
    channel: 'email',
    whatsapp_phone: null,
    whatsapp_available: false,
    hour: 8,
    preview: {
      subject: 'Baydar Demo Trading — your morning brief for Tuesday 10 November',
      headline: 'Tuesday 10 November: 1,250.500 BHD in sales from 12 orders.',
      lines: ['This month so far: 24,952.140 BHD'],
      stock: 'About to run out: Whiteboard.',
      actions: ['Revenue concentration: one customer is 25.2% of revenue.'],
      quiet: false,
    },
    recent: [],
  },
};

function renderSettings() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <BriefSettings />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(briefService.getBrief).mockReset().mockResolvedValue(BRIEF);
  vi.mocked(briefService.updateBriefSettings)
    .mockReset()
    .mockResolvedValue({ data: { id: 1 } });
  vi.mocked(briefService.sendTestBrief).mockReset();
});

describe('the morning brief settings', () => {
  it("shows what today's brief actually says", async () => {
    renderSettings();

    expect(await screen.findByText(/1,250.500 BHD in sales/)).toBeInTheDocument();
    expect(screen.getByText('About to run out: Whiteboard.')).toBeInTheDocument();
    expect(screen.getByText(/Revenue concentration/)).toBeInTheDocument();
  });

  it('lays the figures out as figures when the server sends them', async () => {
    vi.mocked(briefService.getBrief).mockResolvedValue({
      data: {
        ...BRIEF.data,
        preview: {
          ...BRIEF.data.preview,
          figures: {
            revenue: '1250.500',
            change: 0.12,
            orders: 12,
            gross_profit: null,
            month_to_date: '24952.140',
            receivables: '0',
            stock: ['Whiteboard'],
            actions: [
              { title: 'Revenue concentration', message: 'One customer is 25.2% of revenue.' },
            ],
          },
        },
      },
    });
    renderSettings();

    expect(await screen.findByText('Yesterday’s sales')).toBeInTheDocument();
    expect(screen.getByText('12 orders')).toBeInTheDocument();
    expect(screen.getByText('+12%')).toBeInTheDocument();
    // What the role may not see, or what is zero, is not drawn as a tile.
    expect(screen.queryByText('Gross profit')).toBeNull();
    expect(screen.queryByText('Owed to you')).toBeNull();
    expect(screen.getByText('Whiteboard')).toBeInTheDocument();
    expect(screen.getByText('One customer is 25.2% of revenue.')).toBeInTheDocument();
  });

  it('says when the next brief arrives once it is on', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('switch'));

    expect(screen.getByText(/The next one arrives tomorrow at .+, by Email\./)).toBeInTheDocument();
  });

  it('turns the brief on and saves the choice', async () => {
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('switch'));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(vi.mocked(briefService.updateBriefSettings).mock.calls[0][0]).toEqual({
      morning_brief: true,
      brief_channel: 'email',
      whatsapp_phone: null,
    });
  });

  it('offers WhatsApp only when it can be sent, and says why not', async () => {
    renderSettings();

    expect(await screen.findByText('Not set up on this installation yet.')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /WhatsApp/ })).toBeDisabled();
  });

  it('asks for a number once WhatsApp is chosen', async () => {
    vi.mocked(briefService.getBrief).mockResolvedValue({
      data: { ...BRIEF.data, enabled: true, whatsapp_available: true },
    });
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('radio', { name: /WhatsApp/ }));
    await user.type(screen.getByLabelText(/WhatsApp number/), '+966 50 180 6978');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(vi.mocked(briefService.updateBriefSettings).mock.calls[0][0]).toMatchObject({
      brief_channel: 'whatsapp',
      whatsapp_phone: '+966 50 180 6978',
    });
  });

  it("sends a test, and says the server's reason when it cannot", async () => {
    vi.mocked(briefService.sendTestBrief).mockRejectedValue(
      new Error('Add a WhatsApp number first.'),
    );
    const user = userEvent.setup();
    renderSettings();

    await user.click(await screen.findByRole('button', { name: /Send me a test/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Add a WhatsApp number first.');
  });

  it('keeps Save off until something changed', async () => {
    renderSettings();

    expect(await screen.findByRole('button', { name: 'Save' })).toBeDisabled();
  });
});
