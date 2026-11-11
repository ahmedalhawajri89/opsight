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

    await user.click(await screen.findByRole('button', { name: 'Is anything about to run out?' }));

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
