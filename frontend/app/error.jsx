'use client';

import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * The last line of defence: a render that threw.
 *
 * Almost every component here is a client component, so an unexpected throw
 * would otherwise blank the whole application — a white page with nothing to
 * read and nowhere to go. This says what happened, offers the one action that
 * usually works, and keeps the way back to the dashboard.
 *
 * Deliberately plain: it must not depend on the shell, the theme tokens beyond
 * the basics, or any data, because any of those could be what failed.
 */
export default function AppError({ error, reset }) {
  const { t } = useI18n();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold text-(--color-text)">{t('states.crash.title')}</h1>
      <p className="measure text-base text-(--color-text-2)">{t('states.crash.description')}</p>

      {/* The digest is what a developer needs to find it in the logs. */}
      {error?.digest && (
        <p className="font-mono text-xs text-(--color-muted)">
          {t('states.error.reference', { reference: error.digest })}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-11 items-center rounded-(--radius-control) bg-(--color-brand) px-5 text-base font-semibold text-(--color-text-inverse) hover:bg-(--color-brand-hover)"
        >
          {t('states.error.retry')}
        </button>
        <a
          href="/dashboard"
          className="inline-flex h-11 items-center rounded-(--radius-control) border border-(--color-line-strong) px-5 text-base font-medium text-(--color-text)"
        >
          {t('states.crash.home')}
        </a>
      </div>
    </main>
  );
}
