'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog, Dialog } from '@/components/ui/Dialog';
import { Field, Input, NumberInput, Select, Textarea } from '@/components/ui/Field';
import { Trans, useI18n } from '@/features/i18n/I18nProvider';
import { useOrderActions } from './useOrders';
import { formatMoney } from '@/lib/format';

/**
 * The lifecycle buttons for one order.
 *
 * Which buttons appear comes from `order.available_actions`, resolved
 * SERVER-SIDE. The client does not re-derive "may this user cancel?" or "is this
 * transition legal?" — asking twice is how the two answers drift apart and a
 * user gets a button that 403s (OrderResource::availableActionsFor).
 */

/** Card first: the most common way a Gulf customer pays. */
const PAYMENT_METHODS = ['card', 'cash', 'cash_on_delivery', 'wallet', 'bank_transfer', 'other'];

export function OrderActions({ order, onDone }) {
  const { t } = useI18n();
  const actions = order.available_actions ?? [];
  const { confirm, fulfil, cancel, refund, pay } = useOrderActions(order.id);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [returnStock, setReturnStock] = useState(true);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState(PAYMENT_METHODS[0]);
  const [payReference, setPayReference] = useState('');
  const [failure, setFailure] = useState(null);

  // What is left to give back, and whether the goods already went back: a
  // second refund can never return stock twice (ADR-022).
  const refundable = order.refundable_amount ?? order.total_amount;
  const stockReturned = Boolean(order.stock_returned);

  function openRefund() {
    setRefundAmount(String(refundable ?? ''));
    setRefundReason('');
    setReturnStock(!stockReturned);
    setRefundOpen(true);
  }

  function openPayment() {
    setPayAmount(String(order.outstanding_amount ?? ''));
    setPayMethod(PAYMENT_METHODS[0]);
    setPayReference('');
    setPayOpen(true);
  }

  const unitCount = (order.items ?? []).reduce((total, item) => total + item.quantity, 0);

  async function run(mutation, payload) {
    setFailure(null);

    try {
      await mutation.mutateAsync(payload);
      onDone?.();

      return true;
    } catch (error) {
      // A 409 is a business rule refusing, e.g. insufficient stock. Its message
      // is written for the user — in their language, by the server — so it is
      // shown as-is.
      setFailure(error.message);

      return false;
    }
  }

  if (actions.length === 0 && !failure) {
    return null;
  }

  return (
    <div className="space-y-2">
      {failure && (
        <p
          role="alert"
          className="rounded-(--radius-control) border border-(--color-danger) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)"
        >
          {failure}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {actions.includes('confirm') && (
          <Button variant="primary" loading={confirm.isPending} onClick={() => run(confirm)}>
            {t('orderActions.confirm')}
          </Button>
        )}

        {actions.includes('fulfil') && (
          <Button variant="secondary" loading={fulfil.isPending} onClick={() => run(fulfil)}>
            {t('orderActions.fulfil')}
          </Button>
        )}

        {actions.includes('cancel') && (
          <Button variant="danger" onClick={() => setCancelOpen(true)}>
            {t('orderActions.cancel')}
          </Button>
        )}

        {actions.includes('record_payment') && (
          <Button variant="secondary" onClick={openPayment}>
            {t('orderActions.recordPayment')}
          </Button>
        )}

        {actions.includes('refund') && (
          <Button variant="danger" onClick={openRefund}>
            {t('orderActions.refund')}
          </Button>
        )}
      </div>

      {/*
        The consequence is stated in BUSINESS terms, with the real numbers —
        not "Are you sure?". A confirmation that does not say what will happen
        is a speed bump, not a safeguard (UI_UX_DIRECTION.md §7).
      */}
      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={t('orderActions.cancelTitle', { reference: order.reference })}
        consequence={t('orderActions.cancelConsequence', {
          count: unitCount,
          amount: formatMoney(order.total_amount),
        })}
        confirmLabel={t('orderActions.cancel')}
        loading={cancel.isPending}
        onConfirm={async () => {
          if (await run(cancel, cancelReason)) setCancelOpen(false);
        }}
      >
        <Field label={t('orderActions.reason')} required>
          {(props) => (
            <Textarea
              placeholder={t('orderActions.reasonPlaceholder')}
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
              {...props}
            />
          )}
        </Field>
      </ConfirmDialog>

      <Dialog
        open={refundOpen}
        onClose={() => setRefundOpen(false)}
        title={t('orderActions.refundTitle', { reference: order.reference })}
        description={t('orderActions.refundRemaining', {
          amount: formatMoney(refundable),
          total: formatMoney(order.total_amount),
        })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRefundOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="danger"
              loading={refund.isPending}
              onClick={async () => {
                const ok = await run(refund, {
                  amount: refundAmount,
                  returnStock,
                  reason: refundReason.trim(),
                });
                if (ok) setRefundOpen(false);
              }}
            >
              {t('orderActions.refund')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('orderActions.refundAmount')} required>
            {(props) => (
              <NumberInput
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
                {...props}
              />
            )}
          </Field>

          <Field label={t('orderActions.refundReason')}>
            {(props) => (
              <Input
                maxLength={255}
                placeholder={t('orderActions.refundReasonPlaceholder')}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                {...props}
              />
            )}
          </Field>

          <label className="flex items-start gap-2 text-base">
            <input
              type="checkbox"
              checked={returnStock}
              disabled={stockReturned}
              onChange={(event) => setReturnStock(event.target.checked)}
              className="mt-0.5 size-3.5 accent-(--color-brand)"
            />
            <span className={stockReturned ? 'text-(--color-muted)' : undefined}>
              {t('orderActions.returnStock')}
              <span className="mt-0.5 block text-sm text-(--color-muted)">
                {stockReturned
                  ? t('orderActions.stockAlreadyReturned')
                  : t('orderActions.returnStockHint')}
              </span>
            </span>
          </label>

          <p className="text-sm text-(--color-muted)">
            <Trans
              k="orderActions.refundPeriodNote"
              tags={{ strong: (text) => <strong>{text}</strong> }}
            />
          </p>
        </div>
      </Dialog>

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title={t('orderActions.paymentTitle', { reference: order.reference })}
        description={t('orderActions.paymentOutstanding', {
          amount: formatMoney(order.outstanding_amount),
        })}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPayOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              loading={pay.isPending}
              onClick={async () => {
                const ok = await run(pay, {
                  amount: payAmount,
                  method: payMethod,
                  reference: payReference.trim(),
                });
                if (ok) setPayOpen(false);
              }}
            >
              {t('orderActions.recordPayment')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t('orderActions.paymentAmount')} required>
            {(props) => (
              <NumberInput
                value={payAmount}
                onChange={(event) => setPayAmount(event.target.value)}
                {...props}
              />
            )}
          </Field>

          <Field label={t('orderActions.paymentMethod')} required>
            {(props) => (
              <Select
                options={PAYMENT_METHODS.map((value) => ({
                  value,
                  label: t(`paymentMethod.${value}`),
                }))}
                value={payMethod}
                onChange={(event) => setPayMethod(event.target.value)}
                className="w-full"
                {...props}
              />
            )}
          </Field>

          <Field
            label={t('orderActions.paymentReference')}
            hint={t('orderActions.paymentReferenceHint')}
          >
            {(props) => (
              <Input
                maxLength={80}
                dir="ltr"
                value={payReference}
                onChange={(event) => setPayReference(event.target.value)}
                {...props}
              />
            )}
          </Field>
        </div>
      </Dialog>
    </div>
  );
}
