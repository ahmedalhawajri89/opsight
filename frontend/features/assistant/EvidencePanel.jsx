'use client';

import { useLayoutEffect, useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';

import { Icon } from '@/components/ui/Icon';
import { metricLabel } from '@/features/analytics/MetricTile';
import { sourceHref, sourceIcon } from '@/features/assistant/ChatMessage';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatDate } from '@/lib/format';

/**
 * "Where did the figures come from?": the sources of the latest answer,
 * beside the conversation.
 *
 * This is what makes the answer checkable. Each source is a call Baydar's
 * own engine made (the summary, a trend, a breakdown, the stock risks), with
 * the period and comparison it was asked for, and a link that opens exactly
 * that view. The model words the answer; it computes none of these.
 *
 * When a new answer arrives the rows are dealt in one after another, so the
 * reader sees the evidence change with the answer it belongs to.
 */
export function EvidencePanel({ sources = [], answerId }) {
  const { t } = useI18n();
  const list = useRef(null);
  const reduced = useReducedMotion();

  const period = sources.find((source) => source.from && source.to);
  const compare = sources.find((source) => source.compare && source.compare !== 'none')?.compare;

  useLayoutEffect(() => {
    if (reduced || !list.current) return undefined;

    const tween = gsap.from(list.current.querySelectorAll('[data-evidence-row]'), {
      autoAlpha: 0,
      x: document.documentElement.dir === 'rtl' ? -12 : 12,
      duration: 0.4,
      ease: 'power2.out',
      stagger: 0.07,
      clearProps: 'transform,opacity,visibility',
    });

    return () => tween.revert();
  }, [answerId, reduced]);

  return (
    <aside
      aria-labelledby="evidence-title"
      className="flex flex-col gap-4 rounded-[18px] border border-(--color-line) bg-(--color-surface) p-5"
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-(--color-accent-soft) text-(--color-accent)"
        >
          <Icon name="database" size={17} />
        </span>
        <div className="min-w-0">
          <h2 id="evidence-title" className="text-base font-bold text-(--color-text)">
            {t('assistant.evidence.title')}
          </h2>
          <p className="text-xs text-(--color-text-2)">{t('assistant.evidence.subtitle')}</p>
        </div>
      </div>

      {sources.length === 0 ? (
        <p className="rounded-(--radius-panel) bg-(--color-surface-subtle) px-4 py-5 text-center text-sm leading-relaxed text-(--color-text-2)">
          {t('assistant.evidence.empty')}
        </p>
      ) : (
        <div ref={list} className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-(--radius-panel) bg-(--color-surface-subtle) px-4 py-3 text-[0.8125rem]">
            {period && (
              <>
                <dt className="text-(--color-text-2)">{t('assistant.evidence.period')}</dt>
                <dd className="text-end font-semibold text-(--color-text)">
                  {formatDate(period.from)} – {formatDate(period.to)}
                </dd>
              </>
            )}
            {compare && (
              <>
                <dt className="text-(--color-text-2)">{t('assistant.evidence.compared')}</dt>
                <dd className="text-end font-semibold text-(--color-text)">
                  {t(`period.comparisons.${compare}`)}
                </dd>
              </>
            )}
            <dt className="text-(--color-text-2)">{t('assistant.evidence.computedBy')}</dt>
            <dd className="text-end font-semibold text-(--color-text)">
              {t('assistant.evidence.engine')}
            </dd>
          </dl>

          <ul className="flex flex-col gap-2">
            {sources.map((source, index) => (
              <li key={`${source.tool}-${index}`} data-evidence-row>
                <Link
                  href={sourceHref(source)}
                  className="group flex items-center gap-3 rounded-(--radius-panel) border border-(--color-line) px-3.5 py-3 transition-[border-color,background-color] duration-200 hover:border-(--color-brand) hover:bg-(--color-surface-subtle)"
                >
                  <span
                    aria-hidden="true"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] bg-(--color-brand-soft) text-(--color-brand-text)"
                  >
                    <Icon name={sourceIcon(source.tool)} size={15} />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-semibold text-(--color-text)">
                      {t(`assistant.sources.${source.tool}`)}
                      {source.metric && (
                        <span className="font-normal text-(--color-text-2)">
                          {' · '}
                          {metricLabel(t, source.metric)}
                        </span>
                      )}
                    </span>
                    {source.from ? (
                      <span className="text-xs text-(--color-text-2)">
                        {formatDate(source.from)} – {formatDate(source.to)}
                      </span>
                    ) : null}
                  </span>
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-(--color-brand-text)">
                    {t('assistant.evidence.open')}
                    <Icon
                      name="arrowRight"
                      size={13}
                      className="transition-transform duration-200 group-hover:translate-x-0.5 rtl:-scale-x-100 rtl:group-hover:-translate-x-0.5"
                    />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="mt-auto flex gap-2 border-t border-(--color-line-subtle) pt-3 text-xs leading-relaxed text-(--color-text-2)">
        <Icon name="shield" size={14} className="mt-0.5 shrink-0 text-(--color-accent)" />
        {t('assistant.evidence.note')}
      </p>
    </aside>
  );
}
