'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { useI18n } from '@/features/i18n/I18nProvider';
import { AnswerText } from '@/features/assistant/AnswerText';
import { Logo } from '@/components/layout/Logo';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/format';

/** The assistant's mark: the product's own logo, in a soft disc. */
export function AssistantAvatar() {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-(--color-brand-text)"
    >
      <Logo compact size="md" />
    </span>
  );
}

/** A question: a bubble at the reader's side of the column. */
export function UserMessage({ text }) {
  return (
    <div className="flex justify-end">
      <p
        dir="auto"
        className="max-w-[85%] whitespace-pre-line rounded-2xl rounded-se-md bg-(--color-brand-soft) px-4 py-2.5 text-sm leading-6 text-(--color-text)"
      >
        {text}
      </p>
    </div>
  );
}

/**
 * An answer: no bubble, the full reading width, the mark beside it.
 *
 * EVERY SOURCE IS A LINK. Each chip opens the analytics screen on the same
 * period the assistant read, so a doubted figure is one click from being
 * checked against the screen it came from (ADR-038). Stock has no period;
 * its chip opens the inventory instead.
 */
export function AssistantMessage({ message }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return undefined;

    const timer = setTimeout(() => setCopied(false), 1800);

    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(message.text ?? '');
      setCopied(true);
    } catch {
      // A browser that refuses the clipboard leaves the text selectable.
    }
  }

  return (
    <div className="flex gap-3">
      <AssistantAvatar />
      <div className="min-w-0 flex-1 pt-1">
        <AnswerText text={message.text} />

        {message.sources?.length ? (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-medium text-(--color-muted)">
              {t('assistant.sourcesLabel')}
            </p>
            <ul className="flex flex-wrap gap-1.5" aria-label={t('assistant.sourcesLabel')}>
              {message.sources.map((source, i) => (
                <li key={`${source.tool}-${i}`}>
                  <Link
                    href={sourceHref(source)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-(--border) bg-(--color-surface) px-2.5 py-1 text-xs text-(--color-text-2) transition-colors hover:border-(--color-brand) hover:text-(--color-brand-text)"
                  >
                    <Icon
                      name={source.tool === 'get_stock_risks' ? 'shelves' : 'chart'}
                      size={12}
                      aria-hidden="true"
                    />
                    <span>{t(`assistant.sources.${source.tool}`)}</span>
                    {source.from ? (
                      <span className="text-(--color-muted)">
                        {formatDate(source.from)} – {formatDate(source.to)}
                      </span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="mt-2 flex items-center gap-1">
          <button
            type="button"
            onClick={copy}
            className="inline-flex items-center gap-1 rounded-(--radius-control) px-2 py-1 text-xs text-(--color-muted) transition-colors hover:bg-(--color-surface-selected) hover:text-(--color-text)"
          >
            <Icon name={copied ? 'check' : 'copy'} size={13} aria-hidden="true" />
            {copied ? t('assistant.copied') : t('assistant.copy')}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Where a source chip leads: the same view, the same period. */
export function sourceHref(source) {
  if (source.tool === 'get_stock_risks') return '/inventory';
  if (!source.from || !source.to) return '/analytics';

  const params = new URLSearchParams({ preset: 'custom', from: source.from, to: source.to });

  if (source.compare && source.compare !== 'none') params.set('comparison', source.compare);
  if (source.metric) params.set('metric', source.metric);
  if (source.dimension) params.set('dimension', source.dimension);

  return `/analytics?${params.toString()}`;
}

/**
 * While the tools run. A few seconds of nothing reads as broken; a line
 * that changes says work is happening. The dots pulse only for readers who
 * have not asked for reduced motion.
 */
export function Thinking() {
  const { t } = useI18n();
  const steps = ['reading', 'comparing', 'writing'];
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 3500);

    return () => clearInterval(timer);
  }, [steps.length]);

  return (
    <div className="flex items-center gap-3" role="status">
      <AssistantAvatar />
      <span className="flex items-center gap-1" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="size-1.5 rounded-full bg-(--color-brand) motion-safe:animate-pulse"
            style={{ animationDelay: `${dot * 180}ms` }}
          />
        ))}
      </span>
      <span className="text-sm text-(--color-muted)">{t(`assistant.steps.${steps[step]}`)}</span>
    </div>
  );
}
