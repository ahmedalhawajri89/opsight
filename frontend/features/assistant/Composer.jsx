'use client';

import { useLayoutEffect, useRef } from 'react';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Icon } from '@/components/ui/Icon';

/** Tallest the box grows before it scrolls, in pixels: about seven lines. */
const MAX_HEIGHT = 180;

/**
 * Where a question is written.
 *
 * It grows with what is typed, up to about seven lines, so a long question
 * is read whole rather than through a two-line slot. Enter sends and
 * Shift+Enter is a new line; Enter while an IME composition is open (Arabic
 * on some keyboards, every CJK input) finishes the word instead of sending
 * half of it. The send button sits inside the box, where the eye already is.
 */
export function Composer({ value, onChange, onSend, busy, autoFocus = false }) {
  const { t } = useI18n();
  const ref = useRef(null);
  const empty = value.trim() === '';

  useLayoutEffect(() => {
    const box = ref.current;

    if (!box) return;

    box.style.height = 'auto';
    box.style.height = `${Math.min(box.scrollHeight, MAX_HEIGHT)}px`;
  }, [value]);

  function submit(event) {
    event.preventDefault();

    if (!empty && !busy) onSend(value);
  }

  return (
    <form onSubmit={submit}>
      <div className="flex min-h-[3.625rem] items-end gap-2.5 rounded-2xl border border-(--color-border) bg-(--color-surface) py-2 ps-4 pe-2 shadow-(--shadow-card) transition-[border-color,box-shadow] duration-200 focus-within:border-(--color-brand-panel) focus-within:shadow-[0_0_0_4px_rgb(15_39_71/0.08)]">
        <label htmlFor="assistant-question" className="sr-only">
          {t('assistant.placeholder')}
        </label>
        <textarea
          id="assistant-question"
          ref={ref}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              submit(event);
            }
          }}
          rows={1}
          maxLength={2000}
          dir="auto"
          // A deliberate exception: on this screen the box IS the task.
          autoFocus={autoFocus}
          placeholder={t('assistant.placeholder')}
          className="max-h-[180px] min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-[0.9375rem] leading-6 text-(--color-text) outline-none placeholder:text-(--color-muted) focus-visible:outline-none"
        />
        <button
          type="submit"
          disabled={empty || busy}
          aria-label={t('assistant.send')}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-(--color-brand-panel) text-(--color-on-brand) transition-[background-color,transform] duration-200 hover:bg-(--color-brand-hover) active:scale-95 disabled:cursor-not-allowed disabled:bg-(--color-surface-selected) disabled:text-(--color-muted)"
        >
          {/* An arrow that points the way the text runs: up, in both directions. */}
          <Icon name="arrowUp" size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="mt-2 text-xs text-(--color-text-2)">
        <span className="hidden sm:inline">{t('assistant.keys')} · </span>
        {t('assistant.disclaimer')}
      </p>
    </form>
  );
}
