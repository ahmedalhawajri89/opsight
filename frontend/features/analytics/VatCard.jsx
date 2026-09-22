'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { formatMoney, formatPercent } from '@/lib/format';
import { Card } from '@/components/layout/PageHeader';
import { ErrorState } from '@/components/data/States';

/**
 * VAT for the period: charged, handed back on refunds, and due (ADR-018).
 *
 * Shown only while the business has VAT switched on. It answers the question
 * an owner actually asks at quarter-end — "how much of what we took belongs to
 * the tax authority?" — and says plainly what it is not: output VAT only, with
 * no purchase VAT to reclaim, so it is not the filed return.
 *
 * Every figure is a string from the API, formatted, never added up here
 * (ADR-015). The rate arrives as a percentage ("10.00") and is only divided
 * for display.
 */
export function VatCard({ vat, loading, error, onRetry, currency, decimals }) {
  const { t } = useI18n();

  if (error) {
    return (
      <Card padded={false}>
        <ErrorState error={error} onRetry={onRetry} />
      </Card>
    );
  }

  if (loading || !vat?.enabled) return null;

  const money = (value) => formatMoney(value, { currency, decimals });
  const rate = (value) =>
    formatPercent(Number(value) / 100, { decimals: Number.isInteger(Number(value)) ? 0 : 2 });

  return (
    <Card title={t('analytics.vat.title')} description={t('analytics.vat.description')}>
      <dl className="grid gap-4 sm:grid-cols-3">
        <Figure label={t('analytics.vat.output')} value={money(vat.output_vat)} />
        <Figure label={t('analytics.vat.refunded')} value={money(vat.refunded_vat)} />
        <Figure label={t('analytics.vat.due')} value={money(vat.vat_due)} strong />
      </dl>

      {vat.by_rate.length > 0 && (
        <table className="mt-5 w-full text-sm">
          <caption className="sr-only">{t('analytics.vat.byRate')}</caption>
          <thead>
            <tr className="border-b border-(--color-line) text-xs font-medium text-(--color-text-2)">
              <th scope="col" className="py-2 text-start font-medium">
                {t('analytics.vat.rate')}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {t('analytics.vat.taxable')}
              </th>
              <th scope="col" className="py-2 text-end font-medium">
                {t('analytics.vat.amount')}
              </th>
            </tr>
          </thead>
          <tbody>
            {vat.by_rate.map((row) => (
              <tr key={row.rate} className="border-b border-(--color-line-subtle) last:border-0">
                <td className="tabular py-2 text-(--color-text)">{rate(row.rate)}</td>
                <td className="tabular py-2 text-end text-(--color-text)">{money(row.taxable)}</td>
                <td className="tabular py-2 text-end text-(--color-text)">{money(row.vat)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="measure mt-4 text-sm text-(--color-muted)">{t('analytics.vat.note')}</p>
    </Card>
  );
}

function Figure({ label, value, strong = false }) {
  return (
    <div>
      <dt className="text-sm text-(--color-text-2)">{label}</dt>
      <dd
        className={`tabular mt-1 text-xl text-(--color-text) ${strong ? 'font-semibold' : 'font-medium'}`}
      >
        {value}
      </dd>
    </div>
  );
}
