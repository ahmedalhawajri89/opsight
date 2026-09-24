'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useAuth } from '@/features/auth/AuthProvider';
import { useI18n } from '@/features/i18n/I18nProvider';
import { Logo } from '@/components/layout/Logo';
import { Button } from '@/components/ui/Button';
import { Field, Input, NumberInput, Select } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { COUNTRIES, countryPreset, settingsFor } from '@/lib/countries';
import { weekdayOptions } from '@/lib/weekdays';
import { completeOnboarding } from '@/services/auth';
import { updateSettings } from '@/services/admin';

/**
 * The setup wizard a new business meets once (ADR-024).
 *
 * Four questions, in the order they matter: where the business trades, whether
 * it charges VAT, which days are its weekend, and then what to do first. The
 * country answers the first three with a STARTING POINT — currency, time zone,
 * week, a VAT rate — which the owner sees and can change before it is saved.
 * Nothing is applied behind their back, and nothing here is guessed at from
 * the browser: a laptop bought abroad has the wrong locale, and a wrong
 * currency is a wrong figure on every screen afterwards.
 *
 * Each step saves as it is left, so a closed tab loses nothing; the last step
 * records that setup is done, which is what stops the owner being brought back
 * here at the next sign-in.
 */
const STEPS = ['market', 'vat', 'week', 'ready'];

export default function OnboardingPage() {
  const { user, replaceUser } = useAuth();
  const { t } = useI18n();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [country, setCountry] = useState(user?.business?.country ?? '');
  const [vat, setVat] = useState({ enabled: false, rate: '0', number: '' });
  const [week, setWeek] = useState({ startsOn: '7', weekend: [5, 6] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const preset = countryPreset(country);
  const days = useMemo(() => weekdayOptions(), []);

  const countryOptions = useMemo(
    () => COUNTRIES.map((entry) => ({ value: entry.code, label: t(`countries.${entry.code}`) })),
    [t],
  );

  function chooseCountry(code) {
    setCountry(code);

    const next = countryPreset(code);

    if (next) {
      // The starting point, shown in the next two steps before it is saved.
      setVat({ enabled: next.vatRate !== null, rate: String(next.vatRate ?? 0), number: '' });
      setWeek({ startsOn: String(next.weekStartsOn), weekend: next.weekend });
    }
  }

  async function save(body) {
    setError(null);
    setSaving(true);

    try {
      await updateSettings(body);

      return true;
    } catch (failure) {
      setError(failure.message);

      return false;
    } finally {
      setSaving(false);
    }
  }

  async function next() {
    if (step === 0) {
      if (!preset) return;
      // The country's whole starting point, so an owner who stops here still
      // has a business set up for where it trades.
      if (await save(settingsFor(preset))) setStep(1);

      return;
    }

    if (step === 1) {
      const body = {
        vat_enabled: vat.enabled,
        vat_rate: vat.enabled ? Number(vat.rate || 0) : 0,
        prices_include_vat: vat.enabled,
        vat_number: vat.number.trim() || null,
      };

      if (await save(body)) setStep(2);

      return;
    }

    if (step === 2) {
      const body = { week_starts_on: Number(week.startsOn), weekend_days: week.weekend };

      if (await save(body)) setStep(3);
    }
  }

  async function finish(destination) {
    setError(null);
    setSaving(true);

    try {
      const response = await completeOnboarding({ country });
      // The new currency and "setup done" reach every screen at once.
      replaceUser(response.data);
      router.replace(destination);
    } catch (failure) {
      setError(failure.message);
      setSaving(false);
    }
  }

  function toggleWeekend(day) {
    setWeek((current) => ({
      ...current,
      weekend: current.weekend.includes(day)
        ? current.weekend.filter((value) => value !== day)
        : [...current.weekend, day].sort((a, b) => a - b),
    }));
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col px-6 py-10">
      <Logo />

      <div className="mt-8">
        <p className="text-sm font-medium text-(--color-text-2)">
          {t('onboarding.stepOf', { step: step + 1, total: STEPS.length })}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-(--color-text)">
          {t(`onboarding.${STEPS[step]}.title`)}
        </h1>
        <p className="measure mt-2 text-base text-(--color-text-2)">
          {t(`onboarding.${STEPS[step]}.description`)}
        </p>
      </div>

      {/* Progress: named, not only drawn. */}
      <ol className="mt-6 flex gap-2" aria-label={t('onboarding.progress')}>
        {STEPS.map((name, index) => (
          <li
            key={name}
            aria-current={index === step ? 'step' : undefined}
            className={`h-1 flex-1 rounded-full ${index <= step ? 'bg-(--color-brand)' : 'bg-(--color-line)'}`}
          >
            <span className="sr-only">{t(`onboarding.${name}.title`)}</span>
          </li>
        ))}
      </ol>

      <div className="rise mt-6 flex-1 rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) p-6 sm:p-8">
        {error && (
          <p
            role="alert"
            className="mb-4 rounded-(--radius-control) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)"
          >
            {error}
          </p>
        )}

        {step === 0 && (
          <div className="space-y-5">
            <Field label={t('onboarding.market.country')} required>
              {(props) => (
                <Select
                  options={countryOptions}
                  placeholder={t('onboarding.market.choose')}
                  value={country}
                  onChange={(event) => chooseCountry(event.target.value)}
                  className="w-full"
                  {...props}
                />
              )}
            </Field>

            {preset && (
              <dl className="space-y-2 rounded-(--radius-control) border border-(--color-line) bg-(--color-ground) p-4 text-base">
                <Summary label={t('onboarding.market.currency')}>
                  {t('onboarding.market.currencyValue', {
                    currency: preset.currency,
                    decimals: preset.decimals,
                  })}
                </Summary>
                <Summary label={t('onboarding.market.timezone')}>{preset.timezone}</Summary>
                <Summary label={t('settings.weekend')}>
                  {preset.weekend.map((day) => days[day - 1].label).join(' · ')}
                </Summary>
              </dl>
            )}

            <p className="measure text-sm text-(--color-muted)">{t('onboarding.market.note')}</p>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={vat.enabled}
                onChange={(event) => setVat({ ...vat, enabled: event.target.checked })}
                className="mt-1 size-4 shrink-0 cursor-pointer accent-(--color-brand)"
              />
              <span>
                <span className="block text-base font-medium text-(--color-text)">
                  {t('onboarding.vat.enabled')}
                </span>
                <span className="block text-sm text-(--color-muted)">
                  {t('onboarding.vat.enabledHint')}
                </span>
              </span>
            </label>

            {vat.enabled && (
              <>
                <Field label={t('settings.vat.rate')} hint={t('onboarding.vat.rateHint')}>
                  {(props) => (
                    <NumberInput
                      value={vat.rate}
                      min="0"
                      max="100"
                      step="0.01"
                      onChange={(event) => setVat({ ...vat, rate: event.target.value })}
                      {...props}
                    />
                  )}
                </Field>

                <Field label={t('settings.vat.number')} hint={t('onboarding.vat.numberHint')}>
                  {(props) => (
                    <Input
                      dir="ltr"
                      maxLength={32}
                      value={vat.number}
                      onChange={(event) => setVat({ ...vat, number: event.target.value })}
                      {...props}
                    />
                  )}
                </Field>
              </>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Field label={t('settings.weekStartsOn')}>
              {(props) => (
                <Select
                  options={days}
                  value={week.startsOn}
                  onChange={(event) => setWeek({ ...week, startsOn: event.target.value })}
                  className="w-full"
                  {...props}
                />
              )}
            </Field>

            <fieldset>
              <legend className="text-sm font-medium text-(--color-text)">
                {t('settings.weekend')}
              </legend>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                {days.map((day) => {
                  const value = Number(day.value);

                  return (
                    <label key={day.value} className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={week.weekend.includes(value)}
                        onChange={() => toggleWeekend(value)}
                        className="size-3.5 cursor-pointer accent-(--color-brand)"
                      />
                      <span className="text-base text-(--color-text)">{day.label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-sm text-(--color-muted)">{t('onboarding.week.note')}</p>
            </fieldset>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <ul className="space-y-3">
              {['products', 'orders', 'analytics'].map((key) => (
                <li key={key} className="flex items-start gap-3">
                  <Icon name="check" size={16} className="mt-1 shrink-0 text-(--color-success)" />
                  <span className="text-base text-(--color-text-2)">
                    {t(`onboarding.ready.${key}`)}
                  </span>
                </li>
              ))}
            </ul>

            {/* Honest about what is not here yet: importing a store arrives later. */}
            <p className="measure rounded-(--radius-control) border border-(--color-line) bg-(--color-ground) p-4 text-sm text-(--color-text-2)">
              {t('onboarding.ready.importNote')}
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          disabled={step === 0 || saving}
          onClick={() => setStep((current) => Math.max(0, current - 1))}
        >
          {t('common.back')}
        </Button>

        {step < 3 ? (
          <Button
            variant="primary"
            loading={saving}
            disabled={step === 0 && !preset}
            onClick={next}
          >
            {t('common.next')}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" loading={saving} onClick={() => finish('/products')}>
              {t('onboarding.ready.addProducts')}
            </Button>
            <Button variant="primary" loading={saving} onClick={() => finish('/dashboard')}>
              {t('onboarding.ready.finish')}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

function Summary({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-(--color-text-2)">{label}</dt>
      <dd className="text-end font-medium text-(--color-text)">{children}</dd>
    </div>
  );
}
