import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AskBaydar } from '@/features/assistant/AskBaydar';
import * as assistant from '@/services/assistant';

vi.mock('@/services/assistant', () => ({
  listConversations: vi.fn(),
  getConversation: vi.fn(),
  ask: vi.fn(),
  deleteConversation: vi.fn(),
}));

vi.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ user: { name: 'Ahmed Al Hawajri' } }),
}));

/*
 * Ask Baydar's screen (ADR-038).
 *
 * The figures are the server's business. What the screen owes the reader is
 * that every answer shows where its figures came from, that the question is
 * visible at once, and that a failure says what happened.
 */

function renderChat() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  return render(
    <QueryClientProvider client={client}>
      <AskBaydar />
    </QueryClientProvider>,
  );
}

const ANSWER = {
  data: {
    conversation_id: 7,
    answer: {
      id: 21,
      role: 'assistant',
      text: 'Net revenue in March was 12,400.000, up 8% on February.',
      sources: [{ tool: 'get_summary', from: '2026-03-01', to: '2026-03-31' }],
    },
  },
};

beforeEach(() => {
  vi.mocked(assistant.listConversations).mockReset().mockResolvedValue({ data: [], meta: { available: true } });
  vi.mocked(assistant.ask).mockReset();
});

describe('asking', () => {
  it('shows the answer with the view of the figures it came from', async () => {
    vi.mocked(assistant.ask).mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderChat();

    await user.type(await screen.findByLabelText('Ask about your business…'), 'How was March?');
    await user.click(screen.getByRole('button', { name: 'Ask' }));

    expect(await screen.findByText(/Net revenue in March/)).toBeInTheDocument();
    expect(screen.getByText('How was March?')).toBeInTheDocument();

    const sources = screen.getByRole('list', { name: 'Where these figures came from' });
    expect(sources).toHaveTextContent('Summary');
  });

  it('sends the conversation id with a follow-up, never the history', async () => {
    vi.mocked(assistant.ask).mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderChat();

    const box = await screen.findByLabelText('Ask about your business…');
    await user.type(box, 'How was March?{Enter}');
    await screen.findByText(/Net revenue in March/);
    await user.type(box, 'Why?{Enter}');

    expect(vi.mocked(assistant.ask).mock.calls[1][0]).toEqual({ message: 'Why?', conversationId: 7 });
  });

  it('keeps Shift+Enter as a new line rather than sending', async () => {
    const user = userEvent.setup();
    renderChat();

    await user.type(await screen.findByLabelText('Ask about your business…'), 'line one{Shift>}{Enter}{/Shift}line two');

    expect(assistant.ask).not.toHaveBeenCalled();
  });

  it('asks a starter question with one click', async () => {
    vi.mocked(assistant.ask).mockResolvedValue(ANSWER);
    const user = userEvent.setup();
    renderChat();

    await user.click(await screen.findByRole('button', { name: /Is anything about to run out\?/ }));

    expect(vi.mocked(assistant.ask).mock.calls[0][0].message).toBe('Is anything about to run out?');
  });

  it('says what went wrong, in the server\'s words', async () => {
    vi.mocked(assistant.ask).mockRejectedValue(
      Object.assign(new Error('This business has used this month\'s questions.'), { status: 429 }),
    );
    const user = userEvent.setup();
    renderChat();

    await user.type(await screen.findByLabelText('Ask about your business…'), 'Hello{Enter}');

    expect(await screen.findByRole('alert')).toHaveTextContent('used this month');
  });
});

describe('before it is set up', () => {
  it('says so instead of offering a box that cannot answer', async () => {
    vi.mocked(assistant.listConversations).mockResolvedValue({ data: [], meta: { available: false } });
    renderChat();

    expect(await screen.findByText(/not set up on this installation/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Ask about your business…')).not.toBeInTheDocument();
  });
});

describe('the text of an answer', () => {
  it('turns **bold** and lists into elements, not asterisks', async () => {
    const { AnswerText } = await import('@/features/assistant/AnswerText');
    const { container } = render(
      <AnswerText text={'Sales **fell 22.5%** in October.\n\n- Orders: 64\n- Refunds: 4.7%\n\n1. Check refunds'} />,
    );

    expect(container.querySelector('strong')).toHaveTextContent('fell 22.5%');
    expect(container.querySelectorAll('ul li')).toHaveLength(2);
    expect(container.querySelectorAll('ol li')).toHaveLength(1);
    expect(container).not.toHaveTextContent('**');
  });

  it('shows a name that looks like HTML as the text it is', async () => {
    // Answers quote the business's own data; none of it may become markup.
    const { AnswerText } = await import('@/features/assistant/AnswerText');
    const { container } = render(<AnswerText text={'Top product: <img src=x onerror=alert(1)>'} />);

    expect(container.querySelector('img')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror=alert(1)>');
  });
});

describe('the redesigned chat', () => {
  it('greets the reader by first name', async () => {
    renderChat();

    expect(await screen.findByText('Hello, Ahmed. What would you like to know?')).toBeInTheDocument();
  });

  it('links every source to the same view and period on the analytics screen', async () => {
    const { sourceHref } = await import('@/features/assistant/ChatMessage');

    expect(sourceHref({ tool: 'get_summary', from: '2026-10-01', to: '2026-10-31', compare: 'previous_hijri_year' }))
      .toBe('/analytics?preset=custom&from=2026-10-01&to=2026-10-31&comparison=previous_hijri_year');
    expect(sourceHref({ tool: 'get_breakdown', from: '2026-08-14', to: '2026-11-11', dimension: 'product', metric: 'gross_profit' }))
      .toContain('dimension=product');
    expect(sourceHref({ tool: 'get_stock_risks', within_days: 14 })).toBe('/inventory');
  });

  it('groups earlier conversations by when they last moved', async () => {
    const { group } = await import('@/features/assistant/ConversationList');
    const now = new Date('2026-11-11T12:00:00');

    const groups = group(
      [
        { id: 1, updated_at: '2026-11-11T09:00:00' },
        { id: 2, updated_at: '2026-11-10T20:00:00' },
        { id: 3, updated_at: '2026-11-07T10:00:00' },
        { id: 4, updated_at: '2026-09-01T10:00:00' },
      ],
      now,
    );

    expect(groups.map((g) => g.key)).toEqual(['today', 'yesterday', 'week', 'earlier']);
  });
});
