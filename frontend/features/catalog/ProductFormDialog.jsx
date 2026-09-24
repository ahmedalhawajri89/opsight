'use client';

import { useState } from 'react';

import { useProductActions } from './useCatalog';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Input, NumberInput } from '@/components/ui/Field';

/**
 * Adding a product, from the screen rather than the API (ADR-024).
 *
 * The caller remounts this on each open (a `key` that changes), so the form
 * starts empty every time without an effect that resets state after render.
 *
 * Until now the catalogue could only be filled by the seeder or a direct API
 * call, which is fine for a demo and impossible for a business that has just
 * signed up: with no product there is no order, and with no order there is no
 * figure anywhere. This is the smallest form that produces a sellable product:
 * what it is called, what it sells for, what it costs, and how many are on the
 * shelf today.
 *
 * `cost` is asked for only from a role that may read it — the same rule the
 * server enforces, which is why the field is absent rather than disabled
 * (ROLES_AND_PERMISSIONS.md §3.2).
 */
const EMPTY = { sku: '', name: '', name_ar: '', price: '', cost: '', opening_stock: '' };

export function ProductFormDialog({ open, onClose, onCreated }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { create } = useProductActions();

  const [values, setValues] = useState(EMPTY);
  const [fieldErrors, setFieldErrors] = useState({});
  const [failure, setFailure] = useState(null);

  const canSeeCost = can('products.view_cost');

  function set(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    setFailure(null);
    setFieldErrors({});

    const body = {
      sku: values.sku.trim(),
      name: values.name.trim(),
      name_ar: values.name_ar.trim() || null,
      price: values.price,
      ...(canSeeCost ? { cost: values.cost } : {}),
      ...(values.opening_stock ? { opening_stock: Number(values.opening_stock) } : {}),
    };

    try {
      const response = await create.mutateAsync(body);

      onCreated?.(response.data);
      onClose();
    } catch (error) {
      // The server owns every rule, including whether this SKU is already
      // used in THIS business (ADR-012, ADR-023).
      if (error.isValidation) {
        setFieldErrors(error.fieldErrors);

        return;
      }

      setFailure(error.message);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('products.new.title')}
      description={t('products.new.description')}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={create.isPending} onClick={submit}>
            {t('products.new.submit')}
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
          label={t('orderDetail.columns.sku')}
          error={fieldErrors.sku?.[0]}
          hint={t('products.new.skuHint')}
          required
        >
          {(props) => (
            <Input
              dir="ltr"
              maxLength={64}
              value={values.sku}
              onChange={(event) => set('sku', event.target.value)}
              {...props}
            />
          )}
        </Field>

        <Field label={t('products.new.name')} error={fieldErrors.name?.[0]} required>
          {(props) => (
            <Input
              maxLength={180}
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              {...props}
            />
          )}
        </Field>

        {/* Optional, and shown to Arabic readers when present (ADR-021). */}
        <Field
          label={t('products.new.nameAr')}
          error={fieldErrors.name_ar?.[0]}
          hint={t('products.new.nameArHint')}
        >
          {(props) => (
            <Input
              dir="rtl"
              lang="ar"
              maxLength={180}
              value={values.name_ar}
              onChange={(event) => set('name_ar', event.target.value)}
              {...props}
            />
          )}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('products.columns.price')} error={fieldErrors.price?.[0]} required>
            {(props) => (
              <NumberInput
                min="0"
                step="0.0001"
                value={values.price}
                onChange={(event) => set('price', event.target.value)}
                {...props}
              />
            )}
          </Field>

          {canSeeCost && (
            <Field label={t('products.columns.cost')} error={fieldErrors.cost?.[0]} required>
              {(props) => (
                <NumberInput
                  min="0"
                  step="0.0001"
                  value={values.cost}
                  onChange={(event) => set('cost', event.target.value)}
                  {...props}
                />
              )}
            </Field>
          )}
        </div>

        <Field
          label={t('products.new.openingStock')}
          error={fieldErrors.opening_stock?.[0]}
          hint={t('products.new.openingStockHint')}
        >
          {(props) => (
            <NumberInput
              min="0"
              step="1"
              value={values.opening_stock}
              onChange={(event) => set('opening_stock', event.target.value)}
              {...props}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
