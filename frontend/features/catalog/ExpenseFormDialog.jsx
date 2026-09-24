'use client';

import { useState } from 'react';

import { useExpenseActions } from './useCatalog';
import { useExpenseCategories } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { DateInput, Field, Input, NumberInput, Select, Textarea } from '@/components/ui/Field';
import { formatMoney, toIsoDate } from '@/lib/format';

/**
 * Recording, correcting and deleting an expense from the screen.
 *
 * Operating expenses are half of net profit, and until now they could only be
 * entered through the API. A date in the past is allowed on purpose: an
 * invoice dated last month is last month's expense, and refusing to backdate
 * would keep the form tidy by making the figures wrong (METRICS.md §2.9).
 *
 * Deleting is soft, and it moves a closed period's profit — so the
 * confirmation says which period, with the amount.
 */
const EMPTY = {
  expense_category_id: '',
  description: '',
  amount: '',
  incurred_on: '',
  vendor: '',
  reference: '',
  notes: '',
};

function initialValues(expense) {
  if (!expense) return { ...EMPTY, incurred_on: toIsoDate(new Date()) };

  return {
    expense_category_id: String(expense.category?.id ?? expense.expense_category_id ?? ''),
    description: expense.description ?? '',
    amount: String(expense.amount ?? ''),
    incurred_on: expense.incurred_on ? expense.incurred_on.slice(0, 10) : '',
    vendor: expense.vendor ?? '',
    reference: expense.reference ?? '',
    notes: expense.notes ?? '',
  };
}

export function ExpenseFormDialog({ open, onClose, expense = null, onSaved }) {
  const { t } = useI18n();
  const { create, update, remove } = useExpenseActions();
  const { categories } = useExpenseCategories();

  const [values, setValues] = useState(() => initialValues(expense));
  const [fieldErrors, setFieldErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const editing = expense !== null;
  const mutation = editing ? update : create;

  function set(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setFailure(null);
    setFieldErrors({});

    const body = {
      expense_category_id: Number(values.expense_category_id),
      description: values.description.trim(),
      amount: values.amount,
      incurred_on: values.incurred_on,
      vendor: values.vendor.trim() || null,
      reference: values.reference.trim() || null,
      notes: values.notes.trim() || null,
    };

    try {
      const response = await mutation.mutateAsync(editing ? { id: expense.id, ...body } : body);

      onSaved?.(response.data);
      onClose();
    } catch (error) {
      if (error.isValidation) {
        setFieldErrors(error.fieldErrors);

        return;
      }

      setFailure(error.message);
    }
  }

  async function destroy() {
    setFailure(null);

    try {
      await remove.mutateAsync(expense.id);
      setConfirmingDelete(false);
      onSaved?.(null);
      onClose();
    } catch (error) {
      setConfirmingDelete(false);
      setFailure(error.message);
    }
  }

  return (
    <>
      <Dialog
        open={open && !confirmingDelete}
        onClose={onClose}
        title={editing ? t('expenses.form.editTitle') : t('expenses.form.newTitle')}
        description={t('expenses.form.description')}
        size="md"
        footer={
          <>
            {editing && (
              <Button
                variant="danger"
                className="me-auto"
                onClick={() => setConfirmingDelete(true)}
              >
                {t('expenses.form.delete')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="primary" loading={mutation.isPending} onClick={submit}>
              {editing ? t('common.save') : t('expenses.form.submit')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {failure && (
            <p
              role="alert"
              className="rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)"
            >
              {failure}
            </p>
          )}

          <Field
            label={t('expenses.columns.description')}
            error={fieldErrors.description?.[0]}
            required
          >
            {(props) => (
              <Input
                maxLength={255}
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
                {...props}
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t('products.columns.category')}
              error={fieldErrors.expense_category_id?.[0]}
              required
            >
              {(props) => (
                <Select
                  options={(categories ?? []).map((category) => ({
                    value: String(category.id),
                    label: category.name,
                  }))}
                  placeholder={t('expenses.form.chooseCategory')}
                  value={values.expense_category_id}
                  onChange={(event) => set('expense_category_id', event.target.value)}
                  className="w-full"
                  {...props}
                />
              )}
            </Field>

            <Field label={t('expenses.columns.amount')} error={fieldErrors.amount?.[0]} required>
              {(props) => (
                <NumberInput
                  min="0"
                  step="0.001"
                  value={values.amount}
                  onChange={(event) => set('amount', event.target.value)}
                  {...props}
                />
              )}
            </Field>

            <Field
              label={t('expenses.columns.incurred')}
              hint={t('expenses.form.incurredHint')}
              error={fieldErrors.incurred_on?.[0]}
              required
            >
              {(props) => (
                <DateInput
                  value={values.incurred_on}
                  onChange={(event) => set('incurred_on', event.target.value)}
                  {...props}
                />
              )}
            </Field>

            <Field label={t('expenses.columns.vendor')} error={fieldErrors.vendor?.[0]}>
              {(props) => (
                <Input
                  maxLength={180}
                  value={values.vendor}
                  onChange={(event) => set('vendor', event.target.value)}
                  {...props}
                />
              )}
            </Field>
          </div>

          <Field
            label={t('expenses.form.reference')}
            hint={t('expenses.form.referenceHint')}
            error={fieldErrors.reference?.[0]}
          >
            {(props) => (
              <Input
                dir="ltr"
                maxLength={80}
                value={values.reference}
                onChange={(event) => set('reference', event.target.value)}
                {...props}
              />
            )}
          </Field>

          <Field label={t('customers.form.notes')} error={fieldErrors.notes?.[0]}>
            {(props) => (
              <Textarea
                rows={3}
                maxLength={5000}
                value={values.notes}
                onChange={(event) => set('notes', event.target.value)}
                {...props}
              />
            )}
          </Field>
        </div>
      </Dialog>

      {/* The consequence in business terms, with the real figure. */}
      <ConfirmDialog
        open={confirmingDelete}
        onClose={() => setConfirmingDelete(false)}
        title={t('expenses.form.deleteTitle')}
        consequence={t('expenses.form.deleteConsequence', {
          amount: formatMoney(expense?.amount),
          description: expense?.description ?? '',
        })}
        confirmLabel={t('expenses.form.delete')}
        loading={remove.isPending}
        onConfirm={destroy}
      />
    </>
  );
}
