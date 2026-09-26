'use client';

import Link from 'next/link';

import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * A URL that names nothing.
 *
 * Reached by a mistyped address or an old link — including, until recently, a
 * link this application printed itself. Next's default page is untranslated
 * and outside the shell, which reads as a crash rather than an answer.
 */
export default function NotFound() {
  const { t } = useI18n();

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-mono text-sm text-(--color-muted)">404</p>
      <h1 className="text-2xl font-semibold text-(--color-text)">{t('states.notFound.title')}</h1>
      <p className="measure text-base text-(--color-text-2)">{t('states.notFound.description')}</p>

      <Link
        href="/dashboard"
        className="mt-2 inline-flex h-11 items-center rounded-(--radius-control) bg-(--color-brand) px-5 text-base font-semibold text-(--color-text-inverse) hover:bg-(--color-brand-hover)"
      >
        {t('states.crash.home')}
      </Link>
    </main>
  );
}
