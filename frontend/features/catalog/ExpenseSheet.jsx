'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Can } from '@/features/auth/Can';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DetailHero, DetailList, DetailSection, DetailSheet } from '@/components/ui/DetailSheet';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';

/**
 * One expense, read without leaving the list (DetailSheet).
 *
 * Opening a row used to drop the reader straight into the edit form, so
 * reading an expense meant risking a change to it. Reading is now the
 * default; editing is one deliberate button, for a role that may edit.
 */
export function ExpenseSheet({ expense, onClose, onEdit }) {
  const { t } = useI18n();

  return (
    <DetailSheet
      open={expense !== null}
      onClose={onClose}
      title={expense?.description ?? ''}
      subtitle={
        expense
          ? t('expenses.sheet.subtitle', { date: formatDate(expense.incurred_on) })
          : undefined
      }
      hero={
        expense ? (
          <DetailHero
            label={t('expenses.columns.amount')}
            value={formatMoney(expense.amount)}
            badge={expense.category ? <Badge tone="neutral">{expense.category.name}</Badge> : null}
          />
        ) : null
      }
      footer={
        <Can ability="expenses.update">
          <Button variant="primary" onClick={() => onEdit(expense)}>
            {t('expenses.form.editTitle')}
          </Button>
        </Can>
      }
    >
      {expense ? (
        <>
          <DetailSection title={t('expenses.sheet.details')}>
            <DetailList
              items={[
                { label: t('expenses.columns.incurred'), value: formatDate(expense.incurred_on) },
                { label: t('expenses.sheet.category'), value: expense.category?.name },
                { label: t('expenses.columns.vendor'), value: expense.vendor },
                { label: t('expenses.form.reference'), value: expense.reference },
                {
                  label: t('expenses.sheet.recorded'),
                  value: expense.created_at ? formatDateTime(expense.created_at) : null,
                },
              ]}
            />
          </DetailSection>

          {expense.notes ? (
            <DetailSection title={t('expenses.sheet.notes')}>
              <p
                dir="auto"
                className="rounded-xl border border-(--border-subtle) px-3.5 py-3 text-sm leading-relaxed whitespace-pre-line text-(--color-text)"
              >
                {expense.notes}
              </p>
            </DetailSection>
          ) : null}
        </>
      ) : null}
    </DetailSheet>
  );
}
