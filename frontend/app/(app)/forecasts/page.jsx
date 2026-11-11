'use client';

import { StockForecastView } from '@/features/forecasts/StockForecastView';
import { useI18n } from '@/features/i18n/I18nProvider';
import { PageHeader } from '@/components/layout/PageHeader';

/** Forecasts (phase D). Stock first; cash follows on this screen. */
export default function ForecastsPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-5">
      <PageHeader title={t('forecasts.title')} description={t('forecasts.description')} />
      <StockForecastView />
    </div>
  );
}
