'use client';

import { useState } from 'react';

import { useSettings, useUpdateSettings } from '@/features/admin/useAdmin';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { Card, PageHeader } from '@/components/layout/PageHeader';

/**
 * Business settings.
 *
 * Two of these fields — the timezone and the fiscal year start — are inputs to
 * every period boundary in the system. Changing one does not alter a single
 * record, but it alters which period every past record falls into, so every
 * month-end total in three years of history shifts. That is stated on the
 * screen BEFORE the save rather than discovered afterwards, and the server
 * names the affected fields so this list cannot go stale.
 */

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
].map((label, index) => ({ value: String(index + 1), label }));

/*
 * A short list rather than the full IANA set.
 *
 * The server validates against the complete list, so a business elsewhere is
 * not locked out — it accepts anything real. This is the shortlist the product
 * actually serves, and a six-hundred-entry dropdown is a worse control than a
 * short one for a field almost nobody changes.
 */
const TIMEZONES = [
  'Asia/Bahrain',
  'Asia/Riyadh',
  'Asia/Kuwait',
  'Asia/Qatar',
  'Asia/Dubai',
  'Asia/Muscat',
  'Europe/London',
  'UTC',
].map((zone) => ({ value: zone, label: zone }));

export default function SettingsPage() {
  const { settings, meta, isLoading, isError, error, refetch } = useSettings();
  const mutation = useUpdateSettings();

  /*
   * `draft` holds ONLY the fields the user has touched, and the rendered form
   * is the server's values with those laid over the top.
   *
   * The obvious alternative — copying the settings into state once they arrive
   * — needs an effect that calls setState, which React now warns about, and it
   * has a real bug behind the warning: a field the user has not touched would
   * be frozen at whatever the first response said, so a change saved in
   * another tab would silently be overwritten on the next save here.
   */
  const [draft, setDraft] = useState({});
  const [saved, setSaved] = useState(false);

  const form = { ...settings, ...draft };

  // A bookmark held by a role without settings.view. Navigation hides the
  // link; a direct hit still has to be refused rather than shown empty.
  if (isError && error?.isForbidden) {
    return <ForbiddenState />;
  }

  if (isError) {
    return (
      <div>
        <PageHeader title="Settings" />
        <Card padded={false}>
          <ErrorState error={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  const editable = meta?.editable ?? false;
  const affectsHistory = meta?.affects_history ?? [];
  const fieldErrors = mutation.error?.fieldErrors ?? {};

  function set(key, value) {
    setDraft({ ...draft, [key]: value });
    setSaved(false);
  }

  function submit(event) {
    event.preventDefault();

    // Only what changed. Sending the whole object would rewrite fields the
    // user never opened, over the top of anyone else's edit.
    mutation.mutate(draft, {
      onSuccess: () => {
        setDraft({});
        setSaved(true);
      },
    });
  }

  const historyChanged =
    settings !== undefined &&
    affectsHistory.some((key) => key in draft && String(draft[key]) !== String(settings[key]));

  return (
    <div className="space-y-4">
      <PageHeader
        title="Settings"
        description="Business configuration, editable at runtime. These are decisions the company makes, not the server it runs on, which is why they are here rather than in a deployment file."
      />

      {!editable && (
        <p
          role="status"
          className="rounded-[--radius-sm] border border-[--color-line] bg-[--color-surface-raised] px-3 py-2 text-[0.8125rem] text-[--color-text-muted]"
        >
          These values are shown because every screen needs the currency and timezone to render
          figures correctly. Only an Owner can change them.
        </p>
      )}

      <Card title="Business" description="Identity and money formatting">
        <form onSubmit={submit} className="max-w-xl space-y-3">
          <Field label="Company name" error={fieldErrors.company_name}>
            {(props) => (
              <Input
                value={form?.company_name ?? ''}
                onChange={(event) => set('company_name', event.target.value)}
                disabled={!editable || isLoading}
                {...props}
              />
            )}
          </Field>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Currency"
              hint="ISO 4217, e.g. BHD. One currency for the whole installation."
              error={fieldErrors.currency}
            >
              {(props) => (
                <Input
                  value={form?.currency ?? ''}
                  onChange={(event) => set('currency', event.target.value.toUpperCase())}
                  disabled={!editable || isLoading}
                  maxLength={3}
                  {...props}
                />
              )}
            </Field>

            <Field
              label="Decimal places"
              hint="Three for the Bahraini dinar; two for most currencies."
              error={fieldErrors.currency_decimals}
            >
              {(props) => (
                <NumberInput
                  value={form?.currency_decimals ?? ''}
                  onChange={(event) => set('currency_decimals', Number(event.target.value))}
                  disabled={!editable || isLoading}
                  min={0}
                  max={3}
                  {...props}
                />
              )}
            </Field>
          </div>

          <Field
            label="Low stock threshold"
            hint="Used for any product that does not set its own."
            error={fieldErrors.default_low_stock_threshold}
          >
            {(props) => (
              <NumberInput
                value={form?.default_low_stock_threshold ?? ''}
                onChange={(event) => set('default_low_stock_threshold', Number(event.target.value))}
                disabled={!editable || isLoading}
                min={0}
                {...props}
              />
            )}
          </Field>

          <fieldset className="space-y-3 rounded-[--radius-sm] border border-[--color-line] p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-[--color-text-muted]">
              Reporting periods
            </legend>

            <p className="text-[0.8125rem] leading-relaxed text-[--color-text-muted]">
              These two decide where every period begins and ends. Changing either one leaves every
              record untouched but moves which month, quarter or year it is counted in, so
              historical totals will shift.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Business timezone" error={fieldErrors.timezone}>
                {(props) => (
                  <Select
                    value={form?.timezone ?? ''}
                    onChange={(event) => set('timezone', event.target.value)}
                    options={TIMEZONES}
                    disabled={!editable || isLoading}
                    {...props}
                  />
                )}
              </Field>

              <Field label="Fiscal year starts" error={fieldErrors.fiscal_year_start_month}>
                {(props) => (
                  <Select
                    value={String(form?.fiscal_year_start_month ?? '')}
                    onChange={(event) => set('fiscal_year_start_month', Number(event.target.value))}
                    options={MONTHS}
                    disabled={!editable || isLoading}
                    {...props}
                  />
                )}
              </Field>
            </div>

            {historyChanged && (
              <p
                role="alert"
                className="rounded-[--radius-sm] border border-[--color-warning] bg-[--color-warning-subtle] px-3 py-2 text-[0.8125rem] text-[--color-warning]"
              >
                You have changed a field that moves historical figures. Saving will change the
                totals reported for periods that have already closed. The underlying orders and
                expenses are not modified.
              </p>
            )}
          </fieldset>

          {editable && (
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" variant="primary" loading={mutation.isPending}>
                Save settings
              </Button>

              {saved && !mutation.isPending && (
                <span role="status" className="text-[0.8125rem] text-[--color-positive]">
                  Saved. Every figure on screen has been recomputed.
                </span>
              )}

              {mutation.isError && !mutation.error?.isValidation && (
                <span role="alert" className="text-[0.8125rem] text-[--color-negative]">
                  {mutation.error?.message}
                </span>
              )}
            </div>
          )}
        </form>
      </Card>
    </div>
  );
}
