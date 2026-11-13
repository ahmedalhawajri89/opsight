'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { EvidencePanel } from '@/features/assistant/EvidencePanel';
import {
  AssistantMessage,
  BaydarMark,
  Thinking,
  UserMessage,
} from '@/features/assistant/ChatMessage';
import { Composer } from '@/features/assistant/Composer';
import { ConversationList } from '@/features/assistant/ConversationList';
import { EmptyChat } from '@/features/assistant/EmptyChat';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { Icon } from '@/components/ui/Icon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
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
  // The answer that has just arrived, revealed line by line; history is not.
  const [freshId, setFreshId] = useState(null);
  const scroller = useRef(null);
  const drawer = useRef(null);
  const { user } = useAuth();
  const reduced = useReducedMotion();

  const list = useQuery({
    queryKey: queryKeys.assistant.list,
    queryFn: assistant.listConversations,
  });

  const ask = useMutation({
    mutationFn: assistant.ask,
    onSuccess: (response, variables) => {
      const { conversation_id: id, answer } = response.data;
      setConversationId(id);
      setFreshId(answer.id);
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
      setFreshId(null);
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

  /*
   * A question asked from the dashboard's card arrives here once: it is left
   * in sessionStorage under HANDOFF_KEY, read, removed, and sent, so a reload
   * does not ask it twice.
   */
  const handedOff = useRef(false);

  useEffect(() => {
    if (handedOff.current) return;
    handedOff.current = true;

    const question = takeHandoff();

    if (question) send(question);
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the newest turn in view as the conversation grows.
  useEffect(() => {
    const box = scroller.current;

    if (box) box.scrollTop = box.scrollHeight;
  }, [thread, ask.isPending]);

  // The earlier conversations slide in from the side the page starts from.
  useLayoutEffect(() => {
    if (!historyOpen || reduced || !drawer.current) return undefined;

    const rtl = document.documentElement.dir === 'rtl';
    const tween = gsap.from(drawer.current, {
      xPercent: rtl ? 100 : -100,
      duration: 0.42,
      ease: 'expo.out',
    });

    return () => tween.revert();
  }, [historyOpen, reduced]);

  if (list.isError && list.error?.isForbidden) {
    return <ForbiddenState />;
  }

  const available = list.data?.meta?.available ?? true;
  const conversations = list.data?.data ?? [];

  function send(text) {
    const message = text.trim();

    if (message === '' || ask.isPending) return;

    setDraft('');
    setThread((current) => [
      ...current,
      { id: 'pending', role: 'user', text: message, pending: true },
    ]);
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

  const answers = thread.filter((message) => message.role !== 'user' && !message.pending);
  const latestAnswer = answers[answers.length - 1];
  const followUps = ['cash', 'channels', 'customers'];

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[34rem] flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-(--color-line) pb-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <Link
            href="/dashboard"
            aria-label={t('assistant.back')}
            title={t('assistant.back')}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-(--color-line) bg-(--color-surface) text-(--color-text) transition-colors hover:bg-(--color-surface-hover)"
          >
            <Icon name="arrowRight" size={17} className="-scale-x-100 rtl:scale-x-100" />
          </Link>
          <BaydarMark size={40} className="rounded-xl" />
          <div className="flex min-w-0 flex-col leading-tight">
            <h2 className="text-lg font-bold text-(--color-text)">{t('assistant.title')}</h2>
            <span className="truncate text-xs text-(--color-text-2)">
              {t('assistant.subtitle', { company: user?.business?.name ?? '' })}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-(--color-line) bg-(--color-surface) px-3.5 text-[0.8125rem] text-(--color-text) transition-colors hover:bg-(--color-surface-hover)"
          >
            <Icon name="clock" size={15} />
            {t('assistant.history')}
          </button>
          <button
            type="button"
            onClick={startNew}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-(--color-brand-panel) px-3.5 text-[0.8125rem] font-semibold text-(--color-on-brand) transition-colors hover:bg-(--color-brand-hover)"
          >
            <Icon name="plus" size={15} />
            {t('assistant.new')}
          </button>
        </div>
      </header>

      {historyOpen ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label={t('common.close')}
            onClick={() => setHistoryOpen(false)}
            className="absolute inset-0 size-full bg-(--color-text)/25"
          />
          <div
            ref={drawer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="history-title"
            className="absolute inset-y-0 start-0 flex w-80 max-w-[88vw] flex-col gap-3 bg-(--color-surface) p-4 shadow-(--shadow-overlay)"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 id="history-title" className="text-base font-bold text-(--color-text)">
                {t('assistant.history')}
              </h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                aria-label={t('common.close')}
                className="inline-flex size-8 items-center justify-center rounded-[9px] text-(--color-text-2) transition-colors hover:bg-(--color-surface-hover) hover:text-(--color-text)"
              >
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{history}</div>
          </div>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 gap-6">
        <section
          aria-label={t('assistant.title')}
          className="relative flex min-w-0 flex-1 flex-col"
        >
          {!available ? (
            <div className="flex flex-1 items-center justify-center">
              <p className="measure text-center text-sm text-(--color-text-2)">
                {t('assistant.unavailable')}
              </p>
            </div>
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={list.refetch} />
          ) : (
            <>
              <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
                {thread.length === 0 && !ask.isPending ? (
                  <EmptyChat onAsk={send} />
                ) : (
                  <ol className="mx-auto w-full max-w-3xl space-y-5 px-1 py-4" aria-live="polite">
                    {thread.map((message) => (
                      <li key={message.id}>
                        {message.role === 'user' ? (
                          <UserMessage text={message.text} />
                        ) : (
                          <AssistantMessage
                            message={message}
                            latest={message === latestAnswer}
                            fresh={message.id === freshId}
                          />
                        )}
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

              <div className="mx-auto flex w-full max-w-3xl flex-col gap-2.5 pt-3">
                {thread.length > 0 && !ask.isPending ? (
                  <div className="flex flex-wrap gap-1.5">
                    {followUps.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => send(t(`assistant.followUps.${key}`))}
                        className="h-[2.125rem] rounded-(--radius-pill) border border-(--color-line) bg-(--color-surface) px-3.5 text-[0.8125rem] text-(--color-text) transition-[border-color,transform] duration-200 hover:-translate-y-px hover:border-(--color-brand-panel)"
                      >
                        {t(`assistant.followUps.${key}`)}
                      </button>
                    ))}
                  </div>
                ) : null}
                {ask.isError ? (
                  <p
                    role="alert"
                    className="rounded-(--radius-control) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)"
                  >
                    {ask.error?.message}
                  </p>
                ) : null}
                <Composer
                  value={draft}
                  onChange={setDraft}
                  onSend={send}
                  busy={ask.isPending}
                  autoFocus
                />
                <p className="text-xs text-(--color-text-2)">{t('assistant.scope')}</p>
              </div>
            </>
          )}
        </section>

        <div className="hidden w-[21rem] shrink-0 overflow-y-auto xl:block">
          <EvidencePanel
            sources={latestAnswer?.sources ?? []}
            answerId={latestAnswer?.id ?? null}
          />
        </div>
      </div>
    </div>
  );
}

/** Where the dashboard leaves a question for this screen to ask. */
export const HANDOFF_KEY = 'baydar:ask';

function takeHandoff() {
  try {
    const question = window.sessionStorage.getItem(HANDOFF_KEY);
    window.sessionStorage.removeItem(HANDOFF_KEY);

    return question?.trim() || null;
  } catch {
    return null;
  }
}
