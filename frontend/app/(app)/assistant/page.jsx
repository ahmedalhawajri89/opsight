'use client';

import { AskBaydar } from '@/features/assistant/AskBaydar';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * Ask Baydar (ADR-038). Permission is the API's: analytics.view.
 *
 * No visible page header: a chat earns the whole height, and the greeting
 * in the empty state already says what this is. The heading stays for
 * screen readers, which navigate a page by its headings.
 */
export default function AssistantPage() {
  const { t } = useI18n();

  return (
    <>
      <h1 className="sr-only">{t('assistant.title')}</h1>
      <AskBaydar />
    </>
  );
}
