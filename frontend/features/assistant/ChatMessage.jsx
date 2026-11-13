'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';

import { useI18n } from '@/features/i18n/I18nProvider';
import { AnswerText } from '@/features/assistant/AnswerText';
import { Icon } from '@/components/ui/Icon';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { cn } from '@/lib/cn';
import { formatDate } from '@/lib/format';

/**
 * Baydar's mark, small, for a chat turn: the bowl and the grain above it.
 * `working` tosses the grain, as on the threshing floor, for as long as the
 * answer is actually being worked out; it stops the moment it arrives.
 */
export function BaydarMark({ size = 32, working = false, className }) {
  const grain = useRef(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (!working || reduced || !grain.current) return undefined;

    const toss = gsap
      .timeline({ repeat: -1 })
      .to(grain.current, { y: -5, x: -1, duration: 0.38, ease: 'power2.out' })
      .to(grain.current, { y: 0, x: 0, duration: 0.38, ease: 'power2.in' })
      .to(grain.current, {
        scaleX: 1.25,
        scaleY: 0.75,
        duration: 0.07,
        yoyo: true,
        repeat: 1,
        transformOrigin: '50% 100%',
      });

    return () => toss.kill();
  }, [working, reduced]);

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[10px] bg-(--color-brand-panel)',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 32 32" width={size * 0.62} height={size * 0.62} fill="none">
        <path d="M28.6 18.6 A12.6 12.6 0 0 1 3.4 18.6 Z" fill="var(--on-brand)" />
        <path
          d="M3.4 18.6h25.2"
          stroke="var(--accent-on-brand)"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle ref={grain} cx="21.5" cy="11.5" r="2.2" fill="var(--accent-on-brand)" />
      </svg>
    </span>
  );
}

/** Kept for callers that only want the mark at rest. */
export function AssistantAvatar() {
  return <BaydarMark size={32} />;
}

/** The reader's question: navy, on the side a sentence starts from. */
export function UserMessage({ text }) {
  const bubble = useEnter({ x: 14 });

  return (
    <div className="flex justify-start">
      <p
        ref={bubble}
        dir="auto"
        className="max-w-[78%] rounded-2xl rounded-ss-md bg-(--color-brand-panel) px-4 py-3 text-[0.9375rem] leading-7 whitespace-pre-line text-(--color-on-brand)"
      >
        {text}
      </p>
    </div>
  );
}

/**
 * One answer, on a card. The latest answer carries a navy frame: it is the
 * one the panel beside the chat is explaining.
 *
 * `fresh` is true only for an answer that has just arrived, not for one
 * read back from history, so only a new answer is revealed line by line.
 */
export function AssistantMessage({ message, latest = false, fresh = false }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const card = useEnter({ y: 14 });
  const body = useRef(null);
  const reduced = useReducedMotion();
  const sources = message.sources ?? [];

  useLayoutEffect(() => {
    if (!fresh || reduced || !body.current) return undefined;

    const lines = body.current.querySelectorAll(':scope > *');
    const tween = gsap.from(lines, {
      autoAlpha: 0,
      y: 8,
      filter: 'blur(4px)',
      duration: 0.45,
      ease: 'power2.out',
      stagger: 0.09,
      delay: 0.15,
      clearProps: 'filter,transform,opacity,visibility',
    });

    return () => tween.revert();
  }, [fresh, reduced]);

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
    <article
      ref={card}
      className={cn(
        'flex flex-col gap-4 rounded-[18px] bg-(--color-surface) px-6 py-5 transition-[border-color,box-shadow] duration-300',
        latest
          ? 'border-2 border-(--color-brand-panel) shadow-(--shadow-card)'
          : 'border border-(--color-line)',
      )}
    >
      <div className="flex items-center gap-2.5">
        <BaydarMark size={28} />
        <span className="text-sm font-semibold text-(--color-text)">{t('assistant.title')}</span>
      </div>

      <div ref={body} className="text-[0.9375rem] leading-[1.85]">
        <AnswerText text={message.text} />
      </div>

      {sources.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={t('assistant.sourcesLabel')}>
          {sources.map((source, i) => (
            <li key={`${source.tool}-${i}`}>
              <Link
                href={sourceHref(source)}
                className="inline-flex min-h-8 items-center gap-1.5 rounded-(--radius-pill) border border-(--color-line) bg-(--color-surface-subtle) px-3 text-xs text-(--color-text-2) transition-colors hover:border-(--color-brand) hover:text-(--color-brand-text)"
              >
                <Icon name={sourceIcon(source.tool)} size={13} />
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
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-(--color-line-subtle) pt-3">
        <span className="flex items-center gap-1.5 text-xs text-(--color-text-2)">
          <Icon name="database" size={13} />
          {t('assistant.answerSources', { count: sources.length })}
        </span>
        <button
          type="button"
          onClick={copy}
          className="inline-flex h-8 items-center gap-1.5 rounded-[10px] border border-(--color-line) bg-(--color-surface) px-3 text-xs text-(--color-text) transition-colors hover:bg-(--color-surface-hover)"
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} />
          {copied ? t('assistant.copied') : t('assistant.copy')}
        </button>
      </div>
    </article>
  );
}

export function sourceIcon(tool) {
  return (
    {
      get_stock_risks: 'shelves',
      get_trend: 'trendUp',
      get_breakdown: 'pie',
      get_insights: 'bolt',
    }[tool] ?? 'chart'
  );
}

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
 * While the answer is being worked out: the mark tossing its grain, and one
 * honest sentence. It used to step through "reading… comparing… writing…"
 * on a timer, which described nothing that was happening; now it says what
 * is true for the whole wait, and a bar of light sweeps the line beneath it
 * for as long as the request is open.
 */
export function Thinking() {
  const { t } = useI18n();
  const row = useEnter({ y: 10 });

  return (
    <div
      ref={row}
      className="flex items-center gap-3 rounded-[18px] border border-(--color-line) bg-(--color-surface) px-5 py-4"
      role="status"
    >
      <BaydarMark size={32} working />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <span className="text-sm text-(--color-text-2)">{t('assistant.thinking')}</span>
        <span
          aria-hidden="true"
          className="relative h-1 w-full max-w-64 overflow-hidden rounded-full bg-(--color-surface-hover)"
        >
          <span className="assist-sweep absolute inset-y-0 w-1/3 rounded-full bg-linear-to-l from-transparent via-(--color-chart-profit) to-transparent" />
        </span>
      </div>
    </div>
  );
}

/** A short entrance for something that has just appeared in the chat. */
function useEnter({ x = 0, y = 0 }) {
  const node = useRef(null);
  const reduced = useReducedMotion();

  useLayoutEffect(() => {
    if (reduced || !node.current) return undefined;

    const tween = gsap.from(node.current, {
      autoAlpha: 0,
      x: document.documentElement.dir === 'rtl' ? x : -x,
      y,
      scale: 0.98,
      duration: 0.45,
      ease: 'power3.out',
      clearProps: 'transform,opacity,visibility',
    });

    return () => tween.revert();
    // Once, when the element appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return node;
}
