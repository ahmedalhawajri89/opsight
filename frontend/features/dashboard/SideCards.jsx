'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Icon } from '@/components/ui/Icon';
import { HANDOFF_KEY } from '@/features/assistant/AskBaydar';
import { useI18n } from '@/features/i18n/I18nProvider';

const SUGGESTIONS = ['topProduct', 'shipping'];
const SUGGESTIONS_SALES = ['sales', 'shipping'];

/**
 * The way into Ask Baydar from the dashboard: a question box and two
 * suggestions. Asking leaves the question for the chat screen, which sends it
 * on arrival (AskBaydar's handoff), so the answer is given where the
 * conversation can continue.
 */
export function AskCard({ canSeeCost }) {
  const { t } = useI18n();
  const router = useRouter();
  const id = useId();
  const [question, setQuestion] = useState('');

  function ask(text) {
    const message = text.trim();

    if (message === '') return;

    try {
      window.sessionStorage.setItem(HANDOFF_KEY, message);
    } catch {
      // Private mode without storage: the chat simply opens empty.
    }

    router.push('/assistant');
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-3.5 rounded-(--radius-card) bg-(--color-brand-panel) p-[1.375rem] text-(--color-on-brand)"
    >
      <div className="flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="inline-flex size-8 items-center justify-center rounded-(--radius-control) bg-(--color-on-brand-raise) text-(--color-accent-on-brand)"
          >
            <Icon name="spark" size={17} />
          </span>
          <h2 id={`${id}-title`} className="text-base font-bold">
            {t('dashboard.home.ask.title')}
          </h2>
        </div>
        <Link
          href="/assistant"
          className="inline-flex min-h-8 items-center text-xs font-semibold text-(--color-accent-on-brand) hover:underline"
        >
          {t('dashboard.home.ask.open')}
        </Link>
      </div>

      <p className="text-[0.8125rem] leading-relaxed text-(--color-on-brand-2)">
        {t('dashboard.home.ask.body')}
      </p>

      <form
        className="flex h-[2.875rem] items-center gap-2 rounded-(--radius-panel) bg-(--color-surface) ps-3.5 pe-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <label htmlFor={`${id}-q`} className="sr-only">
          {t('dashboard.home.ask.label')}
        </label>
        <input
          id={`${id}-q`}
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={2000}
          placeholder={t('dashboard.home.ask.placeholder')}
          className="min-w-0 flex-1 bg-transparent text-[0.8125rem] text-(--color-text) outline-none placeholder:text-(--color-muted)"
        />
        <button
          type="submit"
          aria-label={t('dashboard.home.ask.send')}
          className="inline-flex size-9 items-center justify-center rounded-(--radius-control) bg-(--color-brand-panel) text-(--color-on-brand) transition-colors hover:bg-(--color-brand-hover)"
        >
          <Icon name="arrowRight" size={16} className="rtl:-scale-x-100" />
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5">
        {(canSeeCost ? SUGGESTIONS : SUGGESTIONS_SALES).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => ask(t(`dashboard.home.ask.suggestions.${key}`))}
            className="min-h-[1.875rem] rounded-(--radius-control) border border-(--color-on-brand-line)/45 px-2.5 text-xs text-(--color-on-brand) transition-colors hover:border-(--color-accent-on-brand) hover:bg-(--color-on-brand)/5"
          >
            {t(`dashboard.home.ask.suggestions.${key}`)}
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * What is waiting for the reader: the morning brief, and the financing
 * report for a role that may see cost. Each row says its state in words and
 * links to where it is set up or opened.
 */
export function ReadyCard({ brief, canSeeCost }) {
  const { t } = useI18n();

  const briefState = brief
    ? brief.enabled
      ? t('dashboard.home.ready.briefOn', {
          channel:
            brief.channel === 'whatsapp'
              ? t('dashboard.home.ready.channelWhatsapp')
              : t('dashboard.home.ready.channelEmail'),
        })
      : t('dashboard.home.ready.briefOff')
    : null;

  return (
    <section
      aria-label={t('dashboard.home.ready.title')}
      className="flex flex-col rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) px-5 py-2"
    >
      <Row
        icon="clock"
        tile="bg-(--color-accent-soft) text-(--color-accent)"
        title={t('dashboard.home.ready.brief')}
        detail={briefState}
        href="/settings/brief"
        action={
          brief?.enabled
            ? t('dashboard.home.ready.briefPreview')
            : t('dashboard.home.ready.briefSetup')
        }
      />
      {canSeeCost && (
        <Row
          icon="fileChart"
          tile="bg-(--color-brand-soft) text-(--color-brand-text)"
          title={t('dashboard.home.ready.financing')}
          detail={t('dashboard.home.ready.financingBody')}
          href="/reports"
          action={t('dashboard.home.ready.financingOpen')}
          divided
        />
      )}
    </section>
  );
}

function Row({ icon, tile, title, detail, href, action, divided }) {
  return (
    <div
      className={`flex items-center gap-3 py-3.5 ${divided ? 'border-t border-(--color-line-subtle)' : ''}`}
    >
      <span
        aria-hidden="true"
        className={`inline-flex size-[2.375rem] shrink-0 items-center justify-center rounded-(--radius-panel) ${tile}`}
      >
        <Icon name={icon} size={18} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold text-(--color-text)">{title}</span>
        {detail && <span className="text-xs text-(--color-text-2)">{detail}</span>}
      </span>
      <Link
        href={href}
        className="inline-flex min-h-8 items-center text-xs font-semibold text-(--color-brand-text) hover:underline"
      >
        {action}
      </Link>
    </div>
  );
}
