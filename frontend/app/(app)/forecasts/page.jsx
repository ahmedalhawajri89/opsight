'use client';

import { CashForecastView } from '@/features/forecasts/CashForecastView';
import { StockForecastView } from '@/features/forecasts/StockForecastView';
import { useAuth } from '@/features/auth/AuthProvider';
import { DashboardTabs } from '@/features/dashboard/DashboardTabs';
import { useI18n } from '@/features/i18n/I18nProvider';
import { PageHeader } from '@/components/layout/PageHeader';

/**
 * Forecasts (phase D): what runs out, and whether the money lasts.
 *
 * Each tab is offered only to a role that may see it — stock to anyone who
 * may view inventory, cash to a role that may see cost — so a refused tab is
 * never a click away from a "forbidden" panel.
 */
export default function ForecastsPage() {
  const { t } = useI18n();
  const { can } = useAuth();

  const tabs = [
    can('inventory.view') && {
      id: 'stock',
      label: t('forecasts.tabs.stock'),
      icon: 'box',
      render: () => <StockForecastView />,
    },
    can('metrics.view_cost') && {
      id: 'cash',
      label: t('forecasts.tabs.cash'),
      icon: 'wallet',
      render: () => <CashForecastView />,
    },
  ].filter(Boolean);

  return (
    <div className="space-y-5">
      <PageHeader title={t('forecasts.title')} description={t('forecasts.description')} />
      {tabs.length > 1 ? (
        <DashboardTabs tabs={tabs} label={t('forecasts.title')} />
      ) : (
        tabs[0]?.render()
      )}
    </div>
  );
}
