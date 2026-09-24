'use client';

import { weekdayOptions } from '@/lib/weekdays';
import { useState } from 'react';

import { useSettings, useUpdateSettings } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { getFormatLocale } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, NumberInput, Select } from '@/components/ui/Field';
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

/*
 * Month names come from Intl rather than the dictionaries. Arabic has more than
 * one accepted set — the Levantine كانون الثاني and the Egyptian/Gulf يناير —
 * and the locale data already picks the one used in the region of the locale
 * (ar-BH), which is the same choice every date on screen makes.
 */
function monthOptions() {
  const formatter = new Intl.DateTimeFormat(getFormatLocale(), { month: 'long', timeZone: 'UTC' });

  return Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1),
    label: formatter.format(new Date(Date.UTC(2026, index, 1))),
  }));
}

/*
 * Weekday names from Intl, ISO-numbered (1 = Monday … 7 = Sunday) to match
 * the server. 1 January 2024 was a Monday, so day N of that week is ISO day N.
 */

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
  const { t } = useI18n();
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
        <PageHeader title={t('nav.items.settings')} />
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

  // VAT changes apply to orders confirmed from now on; the server names them.
  const vatChanged =
    settings !== undefined &&
    (meta?.applies_from_now ?? []).some(
      (key) => key in draft && String(draft[key]) !== String(settings[key]),
    );

  return (
    <div className="space-y-4">
      <PageHeader title={t('nav.items.settings')} description={t('settings.description')} />

      {!editable && (
        <p
          role="status"
          className="rounded-(--radius-control) border border-(--color-line) bg-(--color-surface) px-3 py-2 text-sm text-(--color-text-2)"
        >
          {t('settings.readOnly')}
        </p>
      )}

      <Card title={t('settings.business.title')} description={t('settings.business.description')}>
        <form onSubmit={submit} className="max-w-xl space-y-3">
          <Field label={t('settings.companyName')} error={fieldErrors.company_name}>
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
              label={t('settings.currency')}
              hint={t('settings.currencyHint')}
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
              label={t('settings.decimals')}
              hint={t('settings.decimalsHint')}
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
            label={t('settings.lowStock')}
            hint={t('settings.lowStockHint')}
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

          <fieldset className="space-y-3 rounded-(--radius-control) border border-(--color-line) p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-(--color-text-2)">
              {t('settings.periods.title')}
            </legend>

            <p className="text-sm leading-relaxed text-(--color-text-2)">
              {t('settings.periods.description')}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('settings.timezone')} error={fieldErrors.timezone}>
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

              <Field label={t('settings.fiscalYear')} error={fieldErrors.fiscal_year_start_month}>
                {(props) => (
                  <Select
                    value={String(form?.fiscal_year_start_month ?? '')}
                    onChange={(event) => set('fiscal_year_start_month', Number(event.target.value))}
                    options={monthOptions()}
                    disabled={!editable || isLoading}
                    {...props}
                  />
                )}
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t('settings.weekStartsOn')} error={fieldErrors.week_starts_on}>
                {(props) => (
                  <Select
                    value={String(form?.week_starts_on ?? '')}
                    onChange={(event) => set('week_starts_on', Number(event.target.value))}
                    options={weekdayOptions()}
                    disabled={!editable || isLoading}
                    {...props}
                  />
                )}
              </Field>

              {/* Days off: they move no figure, only how a daily chart reads. */}
              <fieldset>
                <legend className="text-sm font-medium text-(--color-text)">
                  {t('settings.weekend')}
                </legend>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  {weekdayOptions().map((day) => {
                    const value = Number(day.value);
                    const weekend = form?.weekend_days ?? [];

                    return (
                      <Checkbox
                        key={day.value}
                        label={day.label}
                        checked={weekend.includes(value)}
                        onChange={(event) =>
                          set(
                            'weekend_days',
                            event.target.checked
                              ? [...weekend, value].sort((a, b) => a - b)
                              : weekend.filter((item) => item !== value),
                          )
                        }
                        disabled={!editable || isLoading}
                      />
                    );
                  })}
                </div>
                <p className="mt-1.5 text-sm text-(--color-muted)">{t('settings.weekendHint')}</p>
              </fieldset>
            </div>

            {historyChanged && (
              <p
                role="alert"
                className="rounded-(--radius-control) border border-(--color-warning) bg-(--color-warning-soft) px-3 py-2 text-sm text-(--color-warning)"
              >
                {t('settings.periods.warning')}
              </p>
            )}
          </fieldset>

          {/*
            Value-added tax (ADR-018). Unlike the period fields above, a change
            here moves NOTHING already recorded: every confirmed order keeps
            the VAT it was confirmed with. The screen says so, because the
            natural fear is the opposite.
          */}
          <fieldset className="space-y-3 rounded-(--radius-control) border border-(--color-line) p-3">
            <legend className="px-1 text-xs font-medium uppercase tracking-wide text-(--color-text-2)">
              {t('settings.vat.title')}
            </legend>

            <p className="text-sm leading-relaxed text-(--color-text-2)">
              {t('settings.vat.description')}
            </p>

            <Checkbox
              label={t('settings.vat.enabled')}
              checked={Boolean(form?.vat_enabled)}
              onChange={(event) => set('vat_enabled', event.target.checked)}
              disabled={!editable || isLoading}
            />

            {form?.vat_enabled && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label={t('settings.vat.rate')}
                    hint={t('settings.vat.rateHint')}
                    error={fieldErrors.vat_rate}
                  >
                    {(props) => (
                      <NumberInput
                        value={form?.vat_rate ?? ''}
                        onChange={(event) => set('vat_rate', event.target.value)}
                        disabled={!editable || isLoading}
                        min={0}
                        max={100}
                        step="0.01"
                        {...props}
                      />
                    )}
                  </Field>

                  <Field label={t('settings.vat.pricing')} error={fieldErrors.prices_include_vat}>
                    {(props) => (
                      <Select
                        value={form?.prices_include_vat ? 'inclusive' : 'exclusive'}
                        onChange={(event) =>
                          set('prices_include_vat', event.target.value === 'inclusive')
                        }
                        options={[
                          { value: 'inclusive', label: t('settings.vat.inclusive') },
                          { value: 'exclusive', label: t('settings.vat.exclusive') },
                        ]}
                        disabled={!editable || isLoading}
                        {...props}
                      />
                    )}
                  </Field>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t('settings.vat.number')} error={fieldErrors.vat_number}>
                    {(props) => (
                      <Input
                        value={form?.vat_number ?? ''}
                        onChange={(event) => set('vat_number', event.target.value || null)}
                        disabled={!editable || isLoading}
                        dir="ltr"
                        maxLength={32}
                        {...props}
                      />
                    )}
                  </Field>

                  <Field
                    label={t('settings.vat.registration')}
                    error={fieldErrors.commercial_registration}
                  >
                    {(props) => (
                      <Input
                        value={form?.commercial_registration ?? ''}
                        onChange={(event) =>
                          set('commercial_registration', event.target.value || null)
                        }
                        disabled={!editable || isLoading}
                        dir="ltr"
                        maxLength={32}
                        {...props}
                      />
                    )}
                  </Field>
                </div>
              </>
            )}

            {vatChanged && (
              <p
                role="status"
                className="rounded-(--radius-control) border border-(--color-line) bg-(--color-info-soft) px-3 py-2 text-sm text-(--color-info)"
              >
                {t('settings.vat.appliesFromNow')}
              </p>
            )}
          </fieldset>

          {editable && (
            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" variant="primary" loading={mutation.isPending}>
                {t('settings.save')}
              </Button>

              {saved && !mutation.isPending && (
                <span role="status" className="text-sm text-(--color-success)">
                  {t('settings.saved')}
                </span>
              )}

              {mutation.isError && !mutation.error?.isValidation && (
                <span role="alert" className="text-sm text-(--color-danger)">
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
