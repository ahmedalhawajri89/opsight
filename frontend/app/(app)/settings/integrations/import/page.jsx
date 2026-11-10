'use client';

import { FileImportWizard } from '@/features/imports/FileImportWizard';
import { useI18n } from '@/features/i18n/I18nProvider';
import { PageHeader } from '@/components/layout/PageHeader';

/**
 * Importing from a spreadsheet (ADR-039), beside Connected stores because it
 * is the same act for a merchant whose "store" is WhatsApp and a workbook.
 * Permission is enforced by the API; a user who may not import is told so
 * on the first request.
 */
export default function ImportPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <PageHeader title={t('imports.title')} description={t('imports.description')} />
      <FileImportWizard />
    </div>
  );
}
