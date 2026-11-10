'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/layout/PageHeader';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import * as assistant from '@/services/assistant';

/**
 * Ask Baydar (ADR-038).
 *
 * EVERY ANSWER SHOWS WHERE ITS FIGURES CAME FROM. Under each answer, one chip
 * per tool the assistant ran: which view of the figures, and over which
 * period. An owner who doubts a number can open the same view on the
 * analytics screen and see the same number — which is the whole argument for
 * trusting it.
 *
 * The question appears at once, and a quiet line says the figures are being
 * read; an answer that takes several tool calls is a few seconds, and a
 * screen that shows nothing for that long looks broken.
 */

const STARTERS = ['month', 'ramadan', 'products', 'stock'];

export function AskBaydar() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = useState(null);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');
  const endRef = useRef(null);

  const list = useQuery({ queryKey: queryKeys.assistant.list, queryFn: assistant.listConversations });

  const ask = useMutation({
    mutationFn: assistant.ask,
    onSuccess: (response, variables) => {
      const { conversation_id: id, answer } = response.data;
      setConversationId(id);
      setThread((current) => [
        ...current.filter((m) => !m.pending),
        { id: `q-${answer.id}`, role: 'user', text: variables.message },
        answer,
      ]);
      queryClient.invalidateQueries({ queryKey: queryKeys.assistant.list });
    },
    onError: () => setThread((current) => current.filter((m) => !m.pending)),
  });

  const open = useMutation({
    mutationFn: assistant.getConversation,
    onSuccess: (response) => {
      setConversationId(response.data.id);
      setThread(response.data.messages);
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [thread, ask.isPending]);

  if (list.isError && list.error?.isForbidden) {
    return <ForbiddenState />;
  }

  const available = list.data?.meta?.available ?? true;
  const conversations = list.data?.data ?? [];

  function send(text) {
    const message = text.trim();

    if (message === '' || ask.isPending) return;

    setDraft('');
    setThread((current) => [...current, { id: 'pending', role: 'user', text: message, pending: true }]);
    ask.mutate({ message, conversationId });
  }

  function startNew() {
    setConversationId(null);
    setThread([]);
    ask.reset();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside aria-label={t('assistant.history')} className="order-2 lg:order-1">
        <Button variant="secondary" size="sm" onClick={startNew} className="w-full">
          <Icon name="plus" size={14} aria-hidden="true" />
          {t('assistant.new')}
        </Button>

        {conversations.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <button
                  type="button"
                  onClick={() => open.mutate(conversation.id)}
                  aria-current={conversation.id === conversationId ? 'true' : undefined}
                  className={`w-full truncate rounded-(--radius-control) px-2 py-1.5 text-start text-sm ${
                    conversation.id === conversationId
                      ? 'bg-(--color-surface-selected) text-(--color-text)'
                      : 'text-(--color-text-2) hover:bg-(--color-surface-selected)'
                  }`}
                  dir="auto"
                >
                  {conversation.title}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </aside>

      <section className="order-1 min-w-0 lg:order-2" aria-label={t('assistant.title')}>
        {!available ? (
          <Card>
            <p className="measure text-sm text-(--color-text-2)">{t('assistant.unavailable')}</p>
          </Card>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <Card>
            {thread.length === 0 ? (
              <div>
                <p className="measure text-sm text-(--color-text-2)">{t('assistant.intro')}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {STARTERS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => send(t(`assistant.starters.${key}`))}
                      className="rounded-full border border-(--border) px-3 py-1.5 text-sm text-(--color-text) hover:bg-(--color-surface-selected)"
                    >
                      {t(`assistant.starters.${key}`)}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <ol className="space-y-4" aria-live="polite">
                {thread.map((message) => (
                  <li key={message.id} className={message.role === 'user' ? 'flex justify-end' : ''}>
                    {message.role === 'user' ? (
                      <p
                        dir="auto"
                        className="max-w-[85%] rounded-(--radius-control) bg-(--color-accent-soft) px-3 py-2 text-sm text-(--color-text)"
                      >
                        {message.text}
                      </p>
                    ) : (
                      <Answer message={message} />
                    )}
                  </li>
                ))}
                {ask.isPending ? (
                  <li className="flex items-center gap-2 text-sm text-(--color-muted)">
                    <Icon name="clock" size={14} aria-hidden="true" />
                    {t('assistant.reading')}
                  </li>
                ) : null}
              </ol>
            )}

            {ask.isError ? (
              <p role="alert" className="measure mt-4 rounded-(--radius-control) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
                {ask.error?.message}
              </p>
            ) : null}

            <div ref={endRef} />

            <form
              className="mt-5 flex items-end gap-2 border-t border-(--border-subtle) pt-4"
              onSubmit={(event) => {
                event.preventDefault();
                send(draft);
              }}
            >
              <label htmlFor="assistant-question" className="sr-only">
                {t('assistant.placeholder')}
              </label>
              <textarea
                id="assistant-question"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  // Enter sends; Shift+Enter is a new line, as in every chat.
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    send(draft);
                  }
                }}
                rows={2}
                maxLength={2000}
                dir="auto"
                placeholder={t('assistant.placeholder')}
                className="min-h-[2.75rem] flex-1 resize-y rounded-(--radius-control) border border-(--border) bg-(--color-surface) px-3 py-2 text-sm text-(--color-text) placeholder:text-(--color-muted)"
              />
              <Button type="submit" variant="primary" disabled={ask.isPending || draft.trim() === ''}>
                {t('assistant.send')}
              </Button>
            </form>
            <p className="mt-2 text-xs text-(--color-muted)">{t('assistant.disclaimer')}</p>
          </Card>
        )}
      </section>
    </div>
  );
}

/** An answer, with the views of the figures it was built from. */
function Answer({ message }) {
  const { t } = useI18n();

  return (
    <div className="max-w-[85%]">
      <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed text-(--color-text)">
        {message.text}
      </p>
      {message.sources?.length ? (
        <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t('assistant.sourcesLabel')}>
          {message.sources.map((source, i) => (
            <li
              key={`${source.tool}-${i}`}
              className="inline-flex items-center gap-1 rounded-(--radius-chip) border border-(--border-subtle) px-2 py-0.5 text-xs text-(--color-text-2)"
            >
              <Icon name="chart" size={12} aria-hidden="true" />
              {t(`assistant.sources.${source.tool}`)}
              {source.from ? ` · ${formatDate(source.from)} – ${formatDate(source.to)}` : ''}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
