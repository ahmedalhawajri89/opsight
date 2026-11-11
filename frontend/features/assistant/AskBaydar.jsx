'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '@/features/i18n/I18nProvider';
import { AssistantMessage, Thinking, UserMessage } from '@/features/assistant/ChatMessage';
import { Composer } from '@/features/assistant/Composer';
import { ConversationList } from '@/features/assistant/ConversationList';
import { EmptyChat } from '@/features/assistant/EmptyChat';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { Icon } from '@/components/ui/Icon';
import { queryKeys } from '@/lib/queryKeys';
import * as assistant from '@/services/assistant';

/**
 * Ask Baydar (ADR-038).
 *
 * A CHAT, LAID OUT LIKE ONE. The conversation fills the height of the
 * screen and scrolls on its own; the question box stays at the bottom where
 * the next question is written. Answers sit in one centred column about
 * seventy characters wide, because a line that runs the width of a desktop
 * monitor is read with the head rather than the eyes. Earlier conversations
 * are a side panel on a desk and a toggle on a phone.
 *
 * The browser sends a question and a conversation id, never the history:
 * the server keeps the conversation (ADR-038).
 */
export function AskBaydar() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = useState(null);
  const [thread, setThread] = useState([]);
  const [draft, setDraft] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const scroller = useRef(null);

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
      setHistoryOpen(false);
    },
  });

  const remove = useMutation({
    mutationFn: assistant.deleteConversation,
    onSuccess: (_, id) => {
      if (id === conversationId) startNew();
      queryClient.invalidateQueries({ queryKey: queryKeys.assistant.list });
    },
  });

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    const box = scroller.current;

    if (box) box.scrollTop = box.scrollHeight;
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
    setHistoryOpen(false);
    ask.reset();
  }

  const history = (
    <ConversationList
      conversations={conversations}
      activeId={conversationId}
      onOpen={(id) => open.mutate(id)}
      onNew={startNew}
      onDelete={(id) => remove.mutate(id)}
      deleting={remove.isPending}
    />
  );

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[32rem] gap-4">
      <aside className="hidden w-64 shrink-0 border-e border-(--border-subtle) pe-4 lg:block">{history}</aside>

      <section aria-label={t('assistant.title')} className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex items-center justify-between gap-2 pb-2 lg:hidden">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="inline-flex items-center gap-2 rounded-(--radius-control) px-2 py-1.5 text-sm text-(--color-text-2) hover:bg-(--color-surface-selected)"
          >
            <Icon name="menu" size={16} aria-hidden="true" />
            {t('assistant.history')}
          </button>
          <button
            type="button"
            onClick={startNew}
            aria-label={t('assistant.new')}
            className="flex size-8 items-center justify-center rounded-(--radius-control) text-(--color-text-2) hover:bg-(--color-surface-selected)"
          >
            <Icon name="plus" size={16} aria-hidden="true" />
          </button>
        </div>

        {historyOpen ? (
          <div className="absolute inset-x-0 top-11 z-10 h-[60%] rounded-xl border border-(--border) bg-(--color-surface) p-3 shadow-lg lg:hidden">
            {history}
          </div>
        ) : null}

        {!available ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="measure text-center text-sm text-(--color-text-2)">{t('assistant.unavailable')}</p>
          </div>
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={list.refetch} />
        ) : (
          <>
            <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
              {thread.length === 0 && !ask.isPending ? (
                <EmptyChat onAsk={send} />
              ) : (
                <ol className="mx-auto w-full max-w-3xl space-y-6 px-1 py-6" aria-live="polite">
                  {thread.map((message) => (
                    <li key={message.id}>
                      {message.role === 'user' ? <UserMessage text={message.text} /> : <AssistantMessage message={message} />}
                    </li>
                  ))}
                  {ask.isPending ? (
                    <li>
                      <Thinking />
                    </li>
                  ) : null}
                </ol>
              )}
            </div>

            <div className="mx-auto w-full max-w-3xl pt-2">
              {ask.isError ? (
                <p
                  role="alert"
                  className="mb-2 rounded-(--radius-control) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)"
                >
                  {ask.error?.message}
                </p>
              ) : null}
              <Composer value={draft} onChange={setDraft} onSend={send} busy={ask.isPending} autoFocus />
            </div>
          </>
        )}
      </section>
    </div>
  );
}
