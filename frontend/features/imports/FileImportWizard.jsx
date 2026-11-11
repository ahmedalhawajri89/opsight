'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '@/features/i18n/I18nProvider';
import { Button } from '@/components/ui/Button';
import { Field, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/layout/PageHeader';
import { formatNumber } from '@/lib/format';
import { AUDITED_KEYS, queryKeys } from '@/lib/queryKeys';
import * as admin from '@/services/admin';

/**
 * Orders or products from the merchant's own spreadsheet (ADR-039).
 *
 * THREE STEPS, AND THE ORDER IS THE POINT. Choose the file; see which column
 * Baydar thinks holds each field, with the first row's value beside it so a
 * wrong guess is visible at a glance; check every row. Only a clean check
 * offers Import, and changing the file or any mapping takes that offer away
 * again — the rows that were checked must be the rows that are written.
 *
 * The server does the reading and the checking. This screen's job is to make
 * the mapping legible and the errors actionable: each names the spreadsheet
 * row, so the owner can go straight to it.
 */

const KINDS = ['orders', 'products'];

export function FileImportWizard() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [kind, setKind] = useState('orders');
  const [file, setFile] = useState(null);
  const [mapping, setMapping] = useState(null);
  const [checked, setChecked] = useState(null);

  const preview = useMutation({
    mutationFn: admin.previewImport,
    onSuccess: (response) => setMapping(response.data.mapping),
  });

  const check = useMutation({
    mutationFn: admin.runImport,
    onSuccess: (response) => setChecked(response.data),
  });

  const write = useMutation({
    mutationFn: admin.runImport,
    onSuccess: () => {
      [
        queryKeys.orders.all,
        queryKeys.products.all,
        queryKeys.customers.all,
        queryKeys.dashboard.all,
        queryKeys.analytics.all,
        ...AUDITED_KEYS,
      ].forEach((key) => queryClient.invalidateQueries({ queryKey: key }));
    },
  });

  const data = preview.data?.data;

  function reset() {
    setMapping(null);
    setChecked(null);
    preview.reset();
    check.reset();
    write.reset();
  }

  function chooseFile(event) {
    const chosen = event.target.files?.[0] ?? null;
    reset();
    setFile(chosen);

    if (chosen) preview.mutate({ file: chosen, kind });
  }

  function chooseKind(next) {
    setKind(next);
    reset();

    if (file) preview.mutate({ file, kind: next });
  }

  function remap(field, value) {
    setMapping((current) => ({ ...current, [field]: value === '' ? null : Number(value) }));
    // What was checked is no longer what would be written.
    setChecked(null);
    check.reset();
  }

  const fields = data ? Object.keys(data.fields) : [];
  const missingRequired = fields.some(
    (field) => data.fields[field] && (mapping?.[field] ?? null) === null,
  );
  const clean = checked && checked.error_count === 0 && checked.records > 0;
  const problem = preview.error ?? check.error ?? write.error;

  if (write.isSuccess) {
    const result = write.data.data;

    return (
      <Card>
        <p role="status" className="flex items-start gap-2 text-sm text-(--color-success)">
          <Icon name="check" size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
          <span>
            {t(`imports.done.${kind}`, {
              count: formatNumber(result.records),
              lines: formatNumber(result.lines),
            })}
          </span>
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={kind === 'orders' ? '/orders' : '/products'}
            className="text-sm font-medium text-(--color-accent-strong) underline-offset-4 hover:underline"
          >
            {t(`imports.see.${kind}`)}
          </Link>
          <button
            type="button"
            onClick={() => {
              reset();
              setFile(null);
            }}
            className="text-sm text-(--color-text-2) underline-offset-4 hover:underline"
          >
            {t('imports.another')}
          </button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card>
        <h2 className="text-sm font-semibold text-(--color-text)">{t('imports.step1')}</h2>

        <fieldset className="mt-3">
          <legend className="sr-only">{t('imports.kindLabel')}</legend>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((option) => (
              <label
                key={option}
                className={`cursor-pointer rounded-(--radius-control) border px-3 py-1.5 text-sm ${
                  kind === option
                    ? 'border-(--color-accent) bg-(--color-accent-soft) text-(--color-text)'
                    : 'border-(--border) text-(--color-text-2)'
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => chooseKind(option)}
                  className="sr-only"
                />
                {t(`imports.kinds.${option}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="measure mt-3 text-xs text-(--color-muted)">{t(`imports.shape.${kind}`)}</p>

        <Field label={t('imports.file')} hint={t('imports.fileHint')} className="mt-4 max-w-md">
          {(field) => (
            <input
              {...field}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={chooseFile}
              className="block w-full text-sm text-(--color-text-2) file:me-3 file:rounded-(--radius-control) file:border file:border-(--border) file:bg-(--color-surface) file:px-3 file:py-1.5 file:text-sm"
            />
          )}
        </Field>

        {preview.isPending ? (
          <p className="mt-3 text-xs text-(--color-muted)">{t('common.loading')}</p>
        ) : null}
      </Card>

      {problem ? (
        <p
          role="alert"
          className="measure rounded-(--radius-control) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)"
        >
          {problem.message}
        </p>
      ) : null}

      {data && mapping ? (
        <Card>
          <h2 className="text-sm font-semibold text-(--color-text)">{t('imports.step2')}</h2>
          <p className="measure mt-1 text-xs text-(--color-muted)">
            {t('imports.rowsFound', { count: formatNumber(data.rows) })}
          </p>

          <div className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {fields.map((field) => {
              const index = mapping[field];
              const sample = index === null || index === undefined ? null : data.sample[0]?.[index];

              return (
                <Field
                  key={field}
                  label={t(`imports.fields.${field}`)}
                  required={data.fields[field]}
                >
                  {(props) => (
                    <>
                      <Select
                        {...props}
                        value={index ?? ''}
                        onChange={(event) => remap(field, event.target.value)}
                        invalid={data.fields[field] && (index ?? null) === null}
                        placeholder={t('imports.notInFile')}
                        options={data.headers.map((header, i) => ({
                          value: i,
                          label: header || `#${i + 1}`,
                        }))}
                        className="w-full"
                      />
                      {/*
                        The first row's value under its column: "Lamp" under
                        Quantity is a wrong guess anyone can see.
                      */}
                      <p className="mt-1 truncate text-xs text-(--color-muted)" dir="auto">
                        {sample ? t('imports.example', { value: sample }) : ' '}
                      </p>
                    </>
                  )}
                </Field>
              );
            })}
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button
              variant={clean ? 'secondary' : 'primary'}
              disabled={missingRequired || check.isPending}
              onClick={() => check.mutate({ file, kind, mapping, dryRun: true })}
            >
              {check.isPending ? t('common.loading') : t('imports.check')}
            </Button>

            <Button
              variant="primary"
              disabled={!clean || write.isPending}
              onClick={() => write.mutate({ file, kind, mapping, dryRun: false })}
            >
              {write.isPending ? t('common.loading') : t('imports.import')}
            </Button>

            {missingRequired ? (
              <span className="text-xs text-(--color-muted)">{t('imports.chooseRequired')}</span>
            ) : null}
          </div>
        </Card>
      ) : null}

      {checked ? <CheckResult kind={kind} result={checked} /> : null}
    </div>
  );
}

/** What the check found, worded so the owner knows what to do next. */
function CheckResult({ kind, result }) {
  const { t } = useI18n();

  if (result.error_count === 0) {
    return (
      <Card>
        <p role="status" className="flex items-start gap-2 text-sm text-(--color-text)">
          <Icon
            name="check"
            size={16}
            aria-hidden="true"
            className="mt-0.5 shrink-0 text-(--color-success)"
          />
          <span>
            {result.records === 0
              ? t('imports.nothing')
              : t(`imports.ready.${kind}`, {
                  count: formatNumber(result.records),
                  lines: formatNumber(result.lines),
                })}
          </span>
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <p role="alert" className="flex items-start gap-2 text-sm text-(--color-danger)">
        <Icon name="alert" size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>{t('imports.problems', { count: formatNumber(result.error_count) })}</span>
      </p>

      <table className="mt-3 w-full text-start text-sm">
        <thead>
          <tr className="border-b border-(--border-subtle) text-xs text-(--color-muted)">
            <th scope="col" className="w-20 py-1.5 text-start font-medium">
              {t('imports.row')}
            </th>
            <th scope="col" className="py-1.5 text-start font-medium">
              {t('imports.problem')}
            </th>
          </tr>
        </thead>
        <tbody>
          {result.errors.map((error, i) => (
            <tr
              key={`${error.row}-${error.field}-${i}`}
              className="border-b border-(--border-subtle) last:border-0"
            >
              <td className="py-1.5 align-top tabular-nums text-(--color-text-2)">
                {formatNumber(error.row)}
              </td>
              <td className="py-1.5 text-(--color-text)" dir="auto">
                {error.message}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {result.error_count > result.errors.length ? (
        <p className="mt-3 text-xs text-(--color-muted)">
          {t('imports.more', { count: formatNumber(result.error_count - result.errors.length) })}
        </p>
      ) : null}
    </Card>
  );
}
