'use client';

import { FileImportWizard } from '@/features/imports/FileImportWizard';
import { useI18n } from '@/features/i18n/I18nProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { ForbiddenState } from '@/components/data/States';
import { PageHeader } from '@/components/layout/PageHeader';

/**
 * Importing from a spreadsheet (ADR-039), beside Connected stores because it
 * is the same act for a merchant whose "store" is WhatsApp and a workbook.
 * Permission is enforced by the API. The screen asks first too: a role that
 * may not import was shown the whole upload form and refused only once it
 * had chosen a file.
 */
export default function ImportPage() {
  const { t } = useI18n();
  const { can } = useAuth();

  if (!can('integrations.manage')) return <ForbiddenState />;

  return (
    <div className="space-y-5">
      <PageHeader title={t('imports.title')} description={t('imports.description')} />
      <FileImportWizard />
    </div>
  );
}
