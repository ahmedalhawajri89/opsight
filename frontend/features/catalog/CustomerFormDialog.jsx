'use client';

import { useState } from 'react';

import { useCustomerActions } from './useCatalog';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, Textarea } from '@/components/ui/Field';

/**
 * Adding and editing a customer from the screen.
 *
 * The API has always accepted these fields; there was no form for them, so a
 * business could only add a customer through the API. Every rule stays on the
 * server — the address is unique per business, and the phone is normalised to
 * E.164 or refused (ADR-021, ADR-023) — and this maps what comes back onto the
 * fields.
 *
 * The caller remounts it per open (a changing `key`), so it starts from the
 * record it was given.
 */
const EMPTY = {
  name: '',
  name_ar: '',
  email: '',
  phone: '',
  company: '',
  vat_number: '',
  address_line: '',
  city: '',
  country: '',
  notes: '',
};

function initialValues(customer) {
  if (!customer) return EMPTY;

  return Object.fromEntries(Object.keys(EMPTY).map((key) => [key, customer[key] ?? '']));
}

export function CustomerFormDialog({ open, onClose, customer = null, onSaved }) {
  const { t } = useI18n();
  const { create, update } = useCustomerActions();

  const [values, setValues] = useState(() => initialValues(customer));
  const [fieldErrors, setFieldErrors] = useState({});
  const [failure, setFailure] = useState(null);

  const editing = customer !== null;
  const mutation = editing ? update : create;

  function set(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setFailure(null);
    setFieldErrors({});

    // Empty optional fields are sent as null, which clears them on an edit;
    // sending '' would store an empty string and break "has no email".
    const body = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [
        key,
        value.trim() === '' ? null : value.trim(),
      ]),
    );

    try {
      const response = await mutation.mutateAsync(editing ? { id: customer.id, ...body } : body);

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

  function field(key, { label, hint, required = false, ...props } = {}) {
    return (
      <Field label={label} hint={hint} error={fieldErrors[key]?.[0]} required={required}>
        {(fieldProps) => (
          <Input
            value={values[key]}
            onChange={(event) => set(key, event.target.value)}
            {...props}
            {...fieldProps}
          />
        )}
      </Field>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? t('customers.form.editTitle') : t('customers.form.newTitle')}
      description={t('customers.form.description')}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={submit}>
            {editing ? t('common.save') : t('customers.form.submit')}
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

        <div className="grid gap-4 sm:grid-cols-2">
          {field('name', { label: t('customers.form.name'), required: true, maxLength: 180 })}
          {field('name_ar', {
            label: t('customers.form.nameAr'),
            hint: t('products.new.nameArHint'),
            maxLength: 180,
            dir: 'rtl',
            lang: 'ar',
          })}
          {field('email', {
            label: t('customers.columns.email'),
            type: 'email',
            dir: 'ltr',
            maxLength: 190,
          })}
          {/* Stored in international form; a number that cannot be placed is refused. */}
          {field('phone', {
            label: t('customers.form.phone'),
            type: 'tel',
            dir: 'ltr',
            maxLength: 40,
            hint: t('customers.form.phoneHint'),
          })}
          {field('company', { label: t('customers.columns.company'), maxLength: 180 })}
          {field('vat_number', {
            label: t('customers.form.vatNumber'),
            dir: 'ltr',
            maxLength: 32,
            hint: t('customers.form.vatNumberHint'),
          })}
          {field('city', { label: t('customers.form.city'), maxLength: 120 })}
          {field('country', {
            label: t('customers.columns.country'),
            dir: 'ltr',
            maxLength: 2,
            hint: t('customers.form.countryHint'),
            onBlur: () => set('country', values.country.toUpperCase()),
          })}
        </div>

        {field('address_line', { label: t('customers.form.address'), maxLength: 255 })}

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
  );
}
