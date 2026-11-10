'use client';

import { AskBaydar } from '@/features/assistant/AskBaydar';
import { useI18n } from '@/features/i18n/I18nProvider';
import { PageHeader } from '@/components/layout/PageHeader';

/** Ask Baydar (ADR-038). Permission is the API's: analytics.view. */
export default function AssistantPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <PageHeader title={t('assistant.title')} description={t('assistant.description')} />
      <AskBaydar />
    </div>
  );
}
