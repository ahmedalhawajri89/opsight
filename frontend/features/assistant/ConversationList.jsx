'use client';

import { useState } from 'react';

import { useI18n } from '@/features/i18n/I18nProvider';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Icon } from '@/components/ui/Icon';

/**
 * Earlier conversations, grouped by when they last moved: today,
 * yesterday, this week, earlier. A flat list of thirty titles gives the eye
 * nowhere to start; four short groups do.
 *
 * Deleting is one icon per row, shown on hover and on keyboard focus, and
 * always confirmed — it removes the whole conversation.
 */
export function ConversationList({ conversations, activeId, onOpen, onNew, onDelete, deleting }) {
  const { t } = useI18n();
  const [pending, setPending] = useState(null);

  const groups = group(conversations);

  return (
    <nav aria-label={t('assistant.history')} className="flex h-full min-h-0 flex-col">
      <button
        type="button"
        onClick={onNew}
        className="flex h-9 items-center justify-center gap-2 rounded-(--radius-control) bg-(--color-brand) px-3 text-sm font-medium text-(--color-on-brand) transition-colors hover:bg-(--color-brand-hover)"
      >
        <Icon name="plus" size={15} aria-hidden="true" />
        {t('assistant.new')}
      </button>

      <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pe-1">
        {groups.length === 0 ? (
          <p className="px-2 text-xs text-(--color-muted)">{t('assistant.noHistory')}</p>
        ) : (
          groups.map(({ key, items }) => (
            <section key={key}>
              <h3 className="px-2 pb-1 text-xs font-medium text-(--color-muted)">
                {t(`assistant.when.${key}`)}
              </h3>
              <ul className="space-y-0.5">
                {items.map((conversation) => {
                  const active = conversation.id === activeId;

                  return (
                    <li key={conversation.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => onOpen(conversation.id)}
                        aria-current={active ? 'true' : undefined}
                        dir="auto"
                        className={`block w-full truncate rounded-(--radius-control) py-2 ps-2.5 pe-9 text-start text-sm transition-colors ${
                          active
                            ? 'bg-(--color-surface-selected) font-medium text-(--color-text)'
                            : 'text-(--color-text-2) hover:bg-(--color-surface-selected) hover:text-(--color-text)'
                        }`}
                      >
                        {conversation.title}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPending(conversation)}
                        aria-label={t('assistant.delete', { title: conversation.title })}
                        className="absolute inset-y-0 end-1 my-auto flex size-7 items-center justify-center rounded-(--radius-control) text-(--color-muted) opacity-0 transition-opacity hover:bg-(--color-danger-soft) hover:text-(--color-danger) focus-visible:opacity-100 group-hover:opacity-100"
                      >
                        <Icon name="close" size={14} aria-hidden="true" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <ConfirmDialog
        open={pending !== null}
        title={t('assistant.confirmDelete.title')}
        consequence={t('assistant.confirmDelete.consequence')}
        confirmLabel={t('assistant.confirmDelete.action')}
        loading={deleting}
        onConfirm={() => {
          onDelete(pending.id);
          setPending(null);
        }}
        onClose={() => setPending(null)}
      />
    </nav>
  );
}

/** today / yesterday / week / earlier, by the conversation's last activity. */
export function group(conversations, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86_400_000;
  const buckets = { today: [], yesterday: [], week: [], earlier: [] };

  for (const conversation of conversations) {
    const at = new Date(conversation.updated_at).getTime();

    if (at >= startOfToday) buckets.today.push(conversation);
    else if (at >= startOfToday - day) buckets.yesterday.push(conversation);
    else if (at >= startOfToday - 6 * day) buckets.week.push(conversation);
    else buckets.earlier.push(conversation);
  }

  return Object.entries(buckets)
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({ key, items }));
}
