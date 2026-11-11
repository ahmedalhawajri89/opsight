'use client';

import { FinancingReportView } from '@/features/reports/FinancingReportView';
import { useI18n } from '@/features/i18n/I18nProvider';
import { PageHeader } from '@/components/layout/PageHeader';

/** Reports (phase D3): the financing report, printed to PDF by the browser. */
export default function ReportsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <PageHeader
          title={t('reports.financing.title')}
          description={t('reports.financing.description')}
        />
      </div>
      <FinancingReportView />
    </div>
  );
}
