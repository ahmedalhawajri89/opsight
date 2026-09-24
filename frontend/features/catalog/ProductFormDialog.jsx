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

function initialValues(product) {
  if (!product) return EMPTY;

  return {
    sku: product.sku ?? '',
    name: product.name ?? '',
    name_ar: product.name_ar ?? '',
    price: String(product.price ?? ''),
    cost: String(product.cost ?? ''),
    // Opening stock belongs to creation only; stock moves through the ledger.
    opening_stock: '',
  };
}

export function ProductFormDialog({ open, onClose, product = null, onCreated }) {
  const { t } = useI18n();
  const { can } = useAuth();
  const { create, update, setActive } = useProductActions();

  const editing = product !== null;
  const mutation = editing ? update : create;

  const [values, setValues] = useState(() => initialValues(product));
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
      name: values.name.trim(),
      name_ar: values.name_ar.trim() || null,
      price: values.price,
      ...(canSeeCost ? { cost: values.cost } : {}),
      // The SKU is immutable: order lines snapshot it, so changing it would
      // make an old order name a product that never sold.
      ...(editing ? {} : { sku: values.sku.trim() }),
      ...(!editing && values.opening_stock ? { opening_stock: Number(values.opening_stock) } : {}),
    };

    try {
      const response = await mutation.mutateAsync(editing ? { id: product.id, ...body } : body);

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
      title={editing ? t('products.new.editTitle') : t('products.new.title')}
      description={t('products.new.description')}
      size="sm"
      footer={
        <>
          {/* A product with history is never deleted, only taken out of the
              catalogue — past orders keep their snapshot either way. */}
          {editing && can('products.deactivate') && (
            <Button
              variant="ghost"
              className="me-auto"
              loading={setActive.isPending}
              onClick={async () => {
                setFailure(null);

                try {
                  await setActive.mutateAsync({ id: product.id, active: !product.is_active });
                  onCreated?.(null);
                  onClose();
                } catch (error) {
                  setFailure(error.message);
                }
              }}
            >
              {product.is_active ? t('products.new.deactivate') : t('products.new.activate')}
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" loading={mutation.isPending} onClick={submit}>
            {editing ? t('common.save') : t('products.new.submit')}
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
          error={fieldErrors.sku}
          hint={editing ? t('products.new.skuImmutable') : t('products.new.skuHint')}
          required
        >
          {(props) => (
            <Input
              dir="ltr"
              maxLength={64}
              readOnly={editing}
              value={values.sku}
              onChange={(event) => set('sku', event.target.value)}
              {...props}
            />
          )}
        </Field>

        <Field label={t('products.new.name')} error={fieldErrors.name} required>
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
          error={fieldErrors.name_ar}
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
          <Field label={t('products.columns.price')} error={fieldErrors.price} required>
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
            <Field label={t('products.columns.cost')} error={fieldErrors.cost} required>
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

        {/* Only on creation: afterwards stock moves through the ledger, with
            a reason, on the inventory screen. */}
        {!editing && (
          <Field
            label={t('products.new.openingStock')}
            error={fieldErrors.opening_stock}
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
        )}
      </div>
    </Dialog>
  );
}
