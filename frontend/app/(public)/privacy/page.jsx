'use client';

import Link from 'next/link';

import { Logo } from '@/components/layout/Logo';
import { FocusColumn } from '@/components/layout/FocusColumn';
import { useI18n } from '@/features/i18n/I18nProvider';
import { formatNumber } from '@/lib/format';

/**
 * The privacy statement, readable without an account (ADR-026).
 *
 * In its own route group with NO layout of its own, deliberately. `(app)` has
 * a layout that is the authentication gate — it redirects an unauthenticated
 * visitor to /login — and a privacy page that cannot be read without signing
 * in is not a privacy page. `(public)` inherits only the root layout, which is
 * what sets `lang` and `dir` from the cookie in the first byte of HTML, so an
 * Arabic reader gets Arabic before any JavaScript runs.
 *
 * The default retention window is stated as a number rather than read from the
 * API: an anonymous reader belongs to no business, so there is no per-business
 * value to show, and claiming one would be a guess.
 */
const DEFAULT_RETENTION_DAYS = 730;

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold text-(--color-text)">{title}</h2>
      {children}
    </section>
  );
}

export default function PrivacyPage() {
  const { t, locale, setPreferences } = useI18n();

  const other = locale === 'ar' ? 'en' : 'ar';
  const otherName = locale === 'ar' ? 'English' : 'العربية';
  const days = formatNumber(DEFAULT_RETENTION_DAYS);

  return (
    <main className="min-h-dvh bg-(--color-ground) px-6 py-10 sm:px-8 lg:py-16">
      <FocusColumn className="max-w-2xl space-y-8">
        <div className="flex items-start justify-between gap-4">
          <Logo />
          {/* No account yet, so the choice is the cookie's, as on sign-in. */}
          <button
            type="button"
            onClick={() => setPreferences({ locale: other })}
            className="text-sm font-medium text-(--color-brand-text) underline-offset-4 hover:underline"
          >
            {otherName}
          </button>
        </div>

        <header className="space-y-3">
          <h1 className="text-2xl font-semibold text-(--color-text)">{t('privacy.title')}</h1>
          <p className="text-(--color-text-2)">{t('privacy.subtitle')}</p>
          <p className="measure text-sm text-(--color-text-2)">{t('privacy.intro')}</p>
        </header>

        <div className="space-y-6 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-6">
          <Section title={t('privacy.held.title')}>
            <p className="measure text-sm text-(--color-text-2)">{t('privacy.held.body')}</p>
          </Section>

          <Section title={t('privacy.purpose.title')}>
            <p className="measure text-sm text-(--color-text-2)">{t('privacy.purpose.body')}</p>
          </Section>

          <Section title={t('privacy.retention.title')}>
            <p className="measure text-sm text-(--color-text-2)">
              {t('privacy.retention.body', { default: days })}
            </p>
          </Section>

          <Section title={t('privacy.access.title')}>
            <p className="measure text-sm text-(--color-text-2)">{t('privacy.access.body')}</p>
          </Section>

          <Section title={t('privacy.erasure.title')}>
            <p className="measure text-sm text-(--color-text-2)">{t('privacy.erasure.body')}</p>
            {/* The part a reader is most likely to challenge, so it is argued
                rather than asserted. */}
            <p className="measure text-sm text-(--color-text-2)">{t('privacy.erasure.why')}</p>
          </Section>

          <Section title={t('privacy.access_control.title')}>
            <p className="measure text-sm text-(--color-text-2)">
              {t('privacy.access_control.body')}
            </p>
          </Section>

          <Section title={t('privacy.contact.title')}>
            <p className="measure text-sm text-(--color-text-2)">{t('privacy.contact.body')}</p>
          </Section>
        </div>

        <Link
          href="/login"
          className="inline-block text-sm font-medium text-(--color-brand-text) underline-offset-4 hover:underline"
        >
          {t('privacy.back')}
        </Link>
      </FocusColumn>
    </main>
  );
}
