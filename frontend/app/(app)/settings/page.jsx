'use client';

import { useState } from 'react';
import Link from 'next/link';

import { useAuth } from '@/features/auth/AuthProvider';
import { useSettings, useUpdateSettings } from '@/features/admin/useAdmin';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { formatNumber, getFormatLocale } from '@/lib/format';
import { weekdayOptions } from '@/lib/weekdays';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
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
 *
 * THE PAGE IS SORTED BY CONSEQUENCE. Each section carries a badge for what
 * saving it does — restates history (amber), applies from now on (blue),
 * deletes records if lowered (red) — read from the server's meta, so the
 * owner knows the weight of a section before opening a field in it. The
 * save lives in a bar pinned to the foot that counts the unsaved changes and
 * can throw them away, because a long form with one button at the bottom
 * leaves the owner scrolling to find out whether anything is pending.
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

/** The audit retention presets, in days. Free entry stays beside them. */
const RETENTION_PRESETS = [90, 365, 730, 1825];

const SECTIONS = [
  { id: 'business', icon: 'settings', title: 'settings.business.title' },
  { id: 'periods', icon: 'calendar', title: 'settings.periods.title' },
  { id: 'vat', icon: 'percent', title: 'settings.vat.title' },
  { id: 'retention', icon: 'shield', title: 'settings.retention.title' },
];

/** The other screens an owner configures the business from. */
const RELATED = [
  { href: '/settings/users', icon: 'userCircle', label: 'nav.items.users', ability: 'users.view' },
  { href: '/settings/brief', icon: 'mail', label: 'nav.items.brief', ability: 'dashboard.view' },
  {
    href: '/settings/integrations',
    icon: 'link',
    label: 'nav.items.integrations',
    ability: 'integrations.manage',
  },
];

const IMPACT = {
  history: { tone: 'warning', icon: 'alert' },
  fromNow: { tone: 'info', icon: 'clock' },
  destructive: { tone: 'danger', icon: 'ban' },
};

const IMPACT_TONES = {
  warning: 'bg-(--color-warning-soft) text-(--color-warning)',
  info: 'bg-(--color-info-soft) text-(--color-info)',
  danger: 'bg-(--color-danger-soft) text-(--color-danger)',
};

export default function SettingsPage() {
  const { t } = useI18n();
  const { can } = useAuth();
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
  const disabled = !editable || isLoading;
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

  /*
   * A touched field put back to what the server holds is not a change. The
   * count in the save bar would otherwise say "1 unsaved change" over a form
   * that matches what is stored.
   */
  const changed =
    settings === undefined
      ? []
      : Object.keys(draft).filter(
          (key) => JSON.stringify(draft[key]) !== JSON.stringify(settings[key]),
        );
  const dirty = changed.length > 0;

  const historyChanged = affectsHistory.some((key) => changed.includes(key));

  /*
   * Lowering the retention window deletes audit entries on the next nightly
   * run, with nothing to undo it — so the warning fires on a DECREASE only.
   * Raising it deletes nothing and deserves no alarm.
   */
  const retentionLowered =
    settings !== undefined &&
    (meta?.destructive ?? []).some(
      (key) => changed.includes(key) && Number(draft[key]) < Number(settings[key]),
    );

  // VAT changes apply to orders confirmed from now on; the server names them.
  const vatChanged = (meta?.applies_from_now ?? []).some((key) => changed.includes(key));

  const weekend = form?.weekend_days ?? [];

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.items.settings')} description={t('settings.description')} />

      {!editable && !isLoading && (
        <p
          role="status"
          className="flex items-start gap-2.5 rounded-(--radius-card) border border-(--color-line) bg-(--color-ground) px-4 py-3 text-sm text-(--color-text-2)"
        >
          <Icon name="lock" size={16} className="mt-0.5 shrink-0 text-(--color-muted)" />
          {t('settings.readOnly')}
        </p>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
        {/*
          Where each section is, and what saving it does, at a glance. On a
          narrow screen the sections simply follow one another.
        */}
        <aside className="hidden space-y-5 xl:sticky xl:top-20 xl:block">
          <nav aria-label={t('settings.sections')}>
            <ul className="space-y-1">
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a
                    href={`#settings-${section.id}`}
                    className="flex items-center gap-3 rounded-(--radius-control) px-3 py-2 text-sm font-medium text-(--color-text-2) transition-colors hover:bg-(--color-surface-hover) hover:text-(--color-text)"
                  >
                    <Icon name={section.icon} size={16} className="shrink-0" />
                    {t(section.title)}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {RELATED.some((item) => can(item.ability)) ? (
            <div>
              <p className="px-3 pb-2 text-xs font-medium text-(--color-muted)">
                {t('settings.related')}
              </p>
              <ul className="space-y-1">
                {RELATED.filter((item) => can(item.ability)).map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="group flex items-center gap-3 rounded-(--radius-control) px-3 py-2 text-sm text-(--color-text-2) transition-colors hover:bg-(--color-surface-hover) hover:text-(--color-text)"
                    >
                      <Icon name={item.icon} size={16} className="shrink-0" />
                      <span className="flex-1">{t(item.label)}</span>
                      <Icon
                        name="arrowRight"
                        size={14}
                        className="opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-180"
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <form onSubmit={submit} className="min-w-0 space-y-5">
          {/* ---------------------------------------------------- Business */}
          <Section id="business" icon="settings" title={t('settings.business.title')}>
            <p className="-mt-1 mb-5 text-sm text-(--color-text-2)">
              {t('settings.business.description')}
            </p>

            <div className="grid gap-x-5 gap-y-4 lg:grid-cols-2">
              <Field
                label={t('settings.companyName')}
                error={fieldErrors.company_name}
                className="lg:col-span-2"
              >
                {(props) => (
                  <Input
                    value={form?.company_name ?? ''}
                    onChange={(event) => set('company_name', event.target.value)}
                    disabled={disabled}
                    {...props}
                  />
                )}
              </Field>

              <Field
                label={t('settings.currency')}
                hint={t('settings.currencyHint')}
                error={fieldErrors.currency}
              >
                {(props) => (
                  <Input
                    value={form?.currency ?? ''}
                    onChange={(event) => set('currency', event.target.value.toUpperCase())}
                    disabled={disabled}
                    maxLength={3}
                    dir="ltr"
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
                    disabled={disabled}
                    min={0}
                    max={3}
                    {...props}
                  />
                )}
              </Field>

              <MoneyPreview currency={form?.currency} decimals={form?.currency_decimals} />

              <Field
                label={t('settings.lowStock')}
                hint={t('settings.lowStockHint')}
                error={fieldErrors.default_low_stock_threshold}
              >
                {(props) => (
                  <NumberInput
                    value={form?.default_low_stock_threshold ?? ''}
                    onChange={(event) =>
                      set('default_low_stock_threshold', Number(event.target.value))
                    }
                    disabled={disabled}
                    min={0}
                    {...props}
                  />
                )}
              </Field>
            </div>
          </Section>

          {/* ----------------------------------------------------- Periods */}
          <Section
            id="periods"
            icon="calendar"
            title={t('settings.periods.title')}
            impact={affectsHistory.length > 0 ? 'history' : null}
          >
            <p className="-mt-1 mb-5 text-sm leading-relaxed text-(--color-text-2)">
              {t('settings.periods.description')}
            </p>

            <div className="grid gap-x-5 gap-y-4 lg:grid-cols-3">
              <Field label={t('settings.timezone')} error={fieldErrors.timezone}>
                {(props) => (
                  <Select
                    value={form?.timezone ?? ''}
                    onChange={(event) => set('timezone', event.target.value)}
                    options={TIMEZONES}
                    disabled={disabled}
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
                    disabled={disabled}
                    {...props}
                  />
                )}
              </Field>

              <Field label={t('settings.weekStartsOn')} error={fieldErrors.week_starts_on}>
                {(props) => (
                  <Select
                    value={String(form?.week_starts_on ?? '')}
                    onChange={(event) => set('week_starts_on', Number(event.target.value))}
                    options={weekdayOptions()}
                    disabled={disabled}
                    {...props}
                  />
                )}
              </Field>
            </div>

            {/*
              Days off: they move no figure, only how a daily chart reads.
              Chips rather than a column of boxes, so the week reads as a week;
              each is still a real checkbox underneath.
            */}
            <fieldset className="mt-5">
              <legend className="text-sm font-medium text-(--color-text)">
                {t('settings.weekend')}
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {weekdayOptions().map((day) => {
                  const value = Number(day.value);
                  const on = weekend.includes(value);

                  return (
                    <label
                      key={day.value}
                      className={cn(
                        'relative inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-(--radius-pill) border px-3.5 text-sm font-medium transition-colors duration-(--duration-fast) select-none has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--color-brand)',
                        on
                          ? 'border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand-text)'
                          : 'border-(--color-line) bg-(--color-surface) text-(--color-text-2) hover:bg-(--color-surface-hover)',
                        disabled && 'cursor-not-allowed opacity-60',
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={on}
                        disabled={disabled}
                        onChange={(event) =>
                          set(
                            'weekend_days',
                            event.target.checked
                              ? [...weekend, value].sort((a, b) => a - b)
                              : weekend.filter((item) => item !== value),
                          )
                        }
                      />
                      {on ? <Icon name="check" size={14} /> : null}
                      {day.label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-sm text-(--color-muted)">{t('settings.weekendHint')}</p>
            </fieldset>

            {historyChanged && (
              <Notice tone="warning" icon="alert" role="alert">
                {t('settings.periods.warning')}
              </Notice>
            )}
          </Section>

          {/* --------------------------------------------------------- VAT */}
          {/*
            Value-added tax (ADR-018). Unlike the period fields above, a change
            here moves NOTHING already recorded: every confirmed order keeps
            the VAT it was confirmed with. The screen says so, because the
            natural fear is the opposite.
          */}
          <Section
            id="vat"
            icon="percent"
            title={t('settings.vat.title')}
            impact={(meta?.applies_from_now ?? []).length > 0 ? 'fromNow' : null}
          >
            <p className="-mt-1 mb-5 text-sm leading-relaxed text-(--color-text-2)">
              {t('settings.vat.description')}
            </p>

            <Switch
              label={t('settings.vat.enabled')}
              checked={Boolean(form?.vat_enabled)}
              onChange={(checked) => set('vat_enabled', checked)}
              disabled={disabled}
            />

            {form?.vat_enabled && (
              <div className="mt-5 grid gap-x-5 gap-y-4 lg:grid-cols-2">
                <Field
                  label={t('settings.vat.rate')}
                  hint={t('settings.vat.rateHint')}
                  error={fieldErrors.vat_rate}
                >
                  {(props) => (
                    <NumberInput
                      value={form?.vat_rate ?? ''}
                      onChange={(event) => set('vat_rate', event.target.value)}
                      disabled={disabled}
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
                      disabled={disabled}
                      {...props}
                    />
                  )}
                </Field>

                <Field label={t('settings.vat.number')} error={fieldErrors.vat_number}>
                  {(props) => (
                    <Input
                      value={form?.vat_number ?? ''}
                      onChange={(event) => set('vat_number', event.target.value || null)}
                      disabled={disabled}
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
                      disabled={disabled}
                      dir="ltr"
                      maxLength={32}
                      {...props}
                    />
                  )}
                </Field>
              </div>
            )}

            {vatChanged && (
              <Notice tone="info" icon="info" role="status">
                {t('settings.vat.appliesFromNow')}
              </Notice>
            )}
          </Section>

          {/* --------------------------------------------------- Retention */}
          {/*
            Audit retention (ADR-026). A tone above the amber used for the
            period fields: that change restates figures and is reversible by
            changing it back, and this one destroys records that nothing
            restores.
          */}
          <Section
            id="retention"
            icon="shield"
            title={t('settings.retention.title')}
            impact={(meta?.destructive ?? []).length > 0 ? 'destructive' : null}
          >
            <p className="-mt-1 mb-5 text-sm leading-relaxed text-(--color-text-2)">
              {t('settings.retention.description')}
            </p>

            <div className="flex flex-wrap items-end gap-x-5 gap-y-4">
              <Field
                label={t('settings.retention.label')}
                hint={t('settings.retention.hint', {
                  min: formatNumber(30),
                  max: formatNumber(3650),
                  default: formatNumber(730),
                })}
                error={fieldErrors.activity_retention_days}
                className="w-full max-w-xs"
              >
                {(props) => (
                  <NumberInput
                    min="30"
                    max="3650"
                    step="1"
                    value={form?.activity_retention_days ?? ''}
                    onChange={(event) => set('activity_retention_days', Number(event.target.value))}
                    disabled={!editable}
                    {...props}
                  />
                )}
              </Field>

              <div
                role="group"
                aria-label={t('settings.retention.presets')}
                className="mb-6 flex flex-wrap gap-2"
              >
                {RETENTION_PRESETS.map((days) => {
                  const on = Number(form?.activity_retention_days) === days;

                  return (
                    <button
                      key={days}
                      type="button"
                      aria-pressed={on}
                      disabled={!editable}
                      onClick={() => set('activity_retention_days', days)}
                      className={cn(
                        'h-9 rounded-(--radius-pill) border px-3.5 text-sm font-medium transition-colors duration-(--duration-fast) disabled:cursor-not-allowed disabled:opacity-60',
                        on
                          ? 'border-(--color-brand) bg-(--color-brand-soft) text-(--color-brand-text)'
                          : 'border-(--color-line) bg-(--color-surface) text-(--color-text-2) hover:bg-(--color-surface-hover)',
                      )}
                    >
                      {t(`settings.retention.preset.${days}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {retentionLowered && (
              <Notice tone="danger" icon="alert" role="alert">
                {t('settings.retention.warning')}
              </Notice>
            )}
          </Section>

          {/*
            The save bar. Pinned to the foot of the screen while the form is
            on it, so what is pending is always in view: how many changes,
            a way to throw them away, and the save. Read-only roles have
            nothing to save and get no bar.
          */}
          {editable && (
            <div className="sticky bottom-4 z-20 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface)/95 px-4 py-3 shadow-(--shadow-overlay) backdrop-blur-sm sm:px-5">
              <div className="flex flex-wrap items-center gap-3">
                <p
                  role="status"
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-2 text-sm',
                    mutation.isError && !mutation.error?.isValidation
                      ? 'text-(--color-danger)'
                      : dirty
                        ? 'text-(--color-text)'
                        : saved
                          ? 'text-(--color-success)'
                          : 'text-(--color-muted)',
                  )}
                >
                  {mutation.isError && !mutation.error?.isValidation ? (
                    <>
                      <Icon name="alert" size={16} className="shrink-0" />
                      {mutation.error?.message}
                    </>
                  ) : dirty ? (
                    <>
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full bg-(--color-warning)"
                      />
                      {t('settings.unsaved', { count: formatNumber(changed.length) })}
                    </>
                  ) : saved ? (
                    <>
                      <Icon name="check" size={16} className="shrink-0" />
                      {t('settings.saved')}
                    </>
                  ) : (
                    t('settings.upToDate')
                  )}
                </p>

                <Button
                  type="button"
                  variant="ghost"
                  disabled={!dirty || mutation.isPending}
                  onClick={() => {
                    setDraft({});
                    mutation.reset();
                  }}
                >
                  {t('settings.discard')}
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  loading={mutation.isPending}
                  disabled={!dirty}
                >
                  {t('settings.save')}
                </Button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

/** One section: an icon, a title, and the badge for what saving it does. */
function Section({ id, icon, title, impact = null, children }) {
  const { t } = useI18n();
  const effect = impact ? IMPACT[impact] : null;

  return (
    <section
      id={`settings-${id}`}
      aria-labelledby={`settings-${id}-title`}
      className="scroll-mt-24 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-5 sm:p-6"
    >
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--color-brand-soft) text-(--color-brand-text)">
          <Icon name={icon} size={20} />
        </span>
        <h2
          id={`settings-${id}-title`}
          className="flex-1 text-base font-semibold text-(--color-text)"
        >
          {title}
        </h2>
        {effect ? (
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-(--radius-pill) px-2.5 py-1 text-xs font-medium',
              IMPACT_TONES[effect.tone],
            )}
          >
            <Icon name={effect.icon} size={12} />
            {t(`settings.impact.${impact}`)}
          </span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function Notice({ tone, icon, role, children }) {
  return (
    <p
      role={role}
      className={cn(
        'mt-5 flex items-start gap-2.5 rounded-(--radius-control) px-3.5 py-3 text-sm leading-relaxed',
        IMPACT_TONES[tone],
      )}
    >
      <Icon name={icon} size={16} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

/**
 * An on/off row. A real checkbox with `role="switch"`, so it is announced
 * as on or off and answers the space bar, drawn as a track and a thumb.
 */
function Switch({ label, checked, onChange, disabled }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 rounded-(--radius-control) border border-(--color-line) bg-(--color-ground) px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--color-brand)',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <span className="text-sm font-medium text-(--color-text)">{label}</span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-(--duration-base)',
          checked ? 'bg-(--color-brand)' : 'bg-(--color-line-strong)',
        )}
      >
        <span
          className={cn(
            'absolute size-5 rounded-full bg-white shadow-sm transition-[inset-inline-start] duration-(--duration-base)',
            checked ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </span>
    </label>
  );
}

/**
 * How an amount will look with the currency and decimals as typed, so the
 * owner sees "1,234.500 BHD" rather than reasoning about ISO codes.
 */
function MoneyPreview({ currency, decimals }) {
  const { t } = useI18n();
  const places = Math.min(3, Math.max(0, Number(decimals) || 0));
  let sample = null;

  try {
    sample = new Intl.NumberFormat(getFormatLocale(), {
      style: 'currency',
      currency: String(currency ?? '').trim(),
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    }).format(1234.5);
  } catch {
    // An incomplete or unknown code while it is being typed: no preview.
  }

  return (
    <div className="flex items-center gap-3 self-start rounded-(--radius-control) border border-dashed border-(--color-line-strong) bg-(--color-ground) px-4 py-3">
      <Icon name="coins" size={18} className="shrink-0 text-(--color-brand-text)" />
      <div className="min-w-0">
        <p className="text-xs text-(--color-text-2)">{t('settings.preview')}</p>
        <p className="tabular mt-0.5 truncate text-base font-semibold text-(--color-text)">
          {sample ?? '—'}
        </p>
      </div>
    </div>
  );
}
