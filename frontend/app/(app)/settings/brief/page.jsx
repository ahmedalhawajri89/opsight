'use client';

import { BriefSettings } from '@/features/brief/BriefSettings';
import { useI18n } from '@/features/i18n/I18nProvider';
import { PageHeader } from '@/components/layout/PageHeader';

/** The morning brief's settings (phase C). Permission is the API's. */
export default function BriefPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <PageHeader title={t('brief.title')} description={t('brief.description')} />
      <BriefSettings />
    </div>
  );
}
