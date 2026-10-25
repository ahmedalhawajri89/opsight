'use client';

import Link from 'next/link';
import { use, useState } from 'react';

import { useRouter } from 'next/navigation';

import { useCustomer, useCustomerActions, useCustomerOrders } from '@/features/catalog/useCatalog';
import { CustomerFormDialog } from '@/features/catalog/CustomerFormDialog';
import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Badge, OrderStatusBadge, PaymentStatusBadge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTable, SkeletonText } from '@/components/ui/Skeleton';
import { DataTable } from '@/components/data/DataTable';
import { ExportButton } from '@/components/data/ExportButton';
import { EmptyState, ErrorState, ForbiddenState } from '@/components/data/States';
import { ConfirmDialog } from '@/components/ui/Dialog';
import { Card, PageHeader } from '@/components/layout/PageHeader';
import { Field, Input, Textarea } from '@/components/ui/Field';
import { formatDate, formatMoney } from '@/lib/format';
import * as catalog from '@/services/catalog';

/**
 * One customer: who they are, and everything they have bought.
 *
 * Until now this screen did not exist, and the order screen's link to the
 * customer led nowhere. Order counts and lifetime value are metrics computed
 * from orders (DATABASE_DESIGN.md §3.5), so what is shown here is the orders
 * themselves and what they add up to — not a stored total that could go stale.
 */
export default function CustomerDetailPage({ params }) {
  const { id } = use(params);
  const { can } = useAuth();
  const { t } = useI18n();
  const { customer, isLoading, isError, error, refetch } = useCustomer(id);
  const { orders, meta, isLoading: ordersLoading } = useCustomerOrders(id, { per_page: 25 });
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [erasing, setErasing] = useState(false);
  const [reason, setReason] = useState('');
  const [typedName, setTypedName] = useState('');
  const [failure, setFailure] = useState(null);
  const { remove, erase } = useCustomerActions();
  const router = useRouter();

  if (isLoading) {
    return (
      <div aria-busy="true" className="space-y-4">
        <SkeletonText lines={2} className="max-w-md" />
        <Card>
          <SkeletonTable columns={4} rows={4} />
        </Card>
      </div>
    );
  }

  if (isError) {
    return error?.isForbidden ? (
      <ForbiddenState />
    ) : (
      <Card padded={false}>
        <ErrorState error={error} onRetry={refetch} />
      </Card>
    );
  }

  if (!customer) return null;

  const columns = [
    {
      key: 'reference',
      header: t('orders.columns.order'),
      mono: true,
      width: '13rem',
      cell: (row) => (
        <Link href={`/orders/${row.id}`} className="text-(--color-brand-text) hover:underline">
          {row.reference}
        </Link>
      ),
    },
    {
      key: 'status',
      header: t('orders.columns.status'),
      width: '9rem',
      cell: (row) => <OrderStatusBadge status={row.status} />,
    },
    {
      key: 'payment_status',
      header: t('orders.columns.payment'),
      width: '9rem',
      cell: (row) => <PaymentStatusBadge status={row.payment_status} />,
    },
    {
      key: 'placed_at',
      header: t('orders.columns.placed'),
      numeric: true,
      width: '9rem',
      cell: (row) => formatDate(row.placed_at),
    },
    {
      key: 'total_amount',
      header: t('orders.columns.total'),
      numeric: true,
      width: '10rem',
      cell: (row) => formatMoney(row.total_amount),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title={customer.display_name ?? customer.name}
        description={customer.company ?? t('customers.detail.noCompany')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {!customer.is_active && <Badge tone="neutral">{t('common.inactive')}</Badge>}
            {customer.erased_at && <Badge tone="neutral">{t('customers.detail.erased')}</Badge>}
            {can('customers.export') && (
              <ExportButton
                label={t('customers.detail.exportData')}
                onExport={() => catalog.exportCustomerData(customer.id)}
              />
            )}
            {/* Nothing is editable, deletable or erasable once the person is
                gone: there is no one left to act on. */}
            {can('customers.update') && !customer.erased_at && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                {t('customers.detail.edit')}
              </Button>
            )}
            {can('customers.delete') && !customer.erased_at && (
              <Button variant="danger" onClick={() => setDeleting(true)}>
                {t('customers.detail.delete')}
              </Button>
            )}
            {can('customers.erase') && !customer.erased_at && (
              <Button variant="danger" onClick={() => setErasing(true)}>
                {t('customers.detail.erase')}
              </Button>
            )}
          </div>
        }
      />

      {failure && (
        <p
          role="alert"
          className="rounded-(--radius-control) border border-(--color-danger) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)"
        >
          {failure}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={t('customers.detail.contact')} className="lg:col-span-1">
          <dl className="space-y-2.5 text-base">
            <Row label={t('customers.columns.email')} value={customer.email} ltr />
            <Row label={t('customers.form.phone')} value={customer.phone} ltr />
            <Row label={t('customers.form.vatNumber')} value={customer.vat_number} ltr />
            <Row label={t('customers.form.address')} value={customer.address_line} />
            <Row label={t('customers.form.city')} value={customer.city} />
            <Row label={t('customers.columns.country')} value={customer.country} />
            <Row label={t('customers.columns.added')} value={formatDate(customer.created_at)} />
          </dl>

          {customer.notes && (
            <p className="mt-4 rounded-(--radius-control) border border-(--color-line) bg-(--color-ground) p-3 text-sm text-(--color-text-2)">
              {customer.notes}
            </p>
          )}
        </Card>

        <Card title={t('customers.detail.orders')} className="lg:col-span-2" padded={false}>
          <DataTable
            caption={t('customers.detail.ordersCaption', {
              customer: customer.display_name ?? customer.name,
            })}
            columns={columns}
            rows={orders}
            loading={ordersLoading}
            density="compact"
            empty={
              <EmptyState
                title={t('customers.detail.noOrders')}
                description={t('customers.detail.noOrdersDescription')}
              />
            }
          />
          {meta?.total > 0 && (
            <p className="px-5 py-3 text-sm text-(--color-muted)">
              {t('customers.detail.ordersCount', { count: meta.total })}
            </p>
          )}
        </Card>
      </div>

      {/*
        Soft, and refused by the server for a customer with committed orders —
        their history would stop naming anyone. The refusal is shown as the
        server worded it.
      */}
      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t('customers.detail.deleteTitle')}
        consequence={t('customers.detail.deleteConsequence')}
        confirmLabel={t('customers.detail.delete')}
        loading={remove.isPending}
        onConfirm={async () => {
          setFailure(null);

          try {
            await remove.mutateAsync(customer.id);
            router.replace('/customers');
          } catch (error) {
            setDeleting(false);
            setFailure(error.message);
          }
        }}
      />

      {/*
        Erasure (ADR-026). Irreversible, so the operator types the name — a
        confirmation you cannot give by reflex — and states a reason, which is
        the only part of an erasure anyone can review afterwards.
      */}
      <ConfirmDialog
        open={erasing}
        onClose={() => setErasing(false)}
        title={t('customers.detail.eraseTitle')}
        consequence={t('customers.detail.eraseConsequence')}
        confirmLabel={t('customers.detail.eraseSubmit')}
        loading={erase.isPending}
        confirmDisabled={typedName.trim() !== (customer.name ?? '').trim() || reason.trim().length < 3}
        onConfirm={async () => {
          setFailure(null);

          try {
            await erase.mutateAsync({ id: customer.id, reason: reason.trim() });
            setErasing(false);
            setReason('');
            setTypedName('');
            refetch();
          } catch (error) {
            setErasing(false);
            setFailure(error.message);
          }
        }}
      >
        <div className="space-y-3">
          <Field label={t('customers.detail.eraseReason')} required>
            {(props) => (
              <Textarea
                rows={2}
                maxLength={500}
                placeholder={t('customers.detail.eraseReasonPlaceholder')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                {...props}
              />
            )}
          </Field>

          <Field label={t('customers.detail.eraseConfirmLabel')} required>
            {(props) => (
              <Input
                value={typedName}
                onChange={(event) => setTypedName(event.target.value)}
                {...props}
              />
            )}
          </Field>
        </div>
      </ConfirmDialog>

      <CustomerFormDialog
        key={editing ? 'open' : 'closed'}
        open={editing}
        customer={customer}
        onClose={() => setEditing(false)}
        onSaved={() => refetch()}
      />
    </div>
  );
}

function Row({ label, value, ltr = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-(--color-text-2)">{label}</dt>
      <dd className="text-end text-(--color-text)">
        {value ? (
          ltr ? (
            <bdi dir="ltr">{value}</bdi>
          ) : (
            value
          )
        ) : (
          <span className="text-(--color-muted)">—</span>
        )}
      </dd>
    </div>
  );
}
