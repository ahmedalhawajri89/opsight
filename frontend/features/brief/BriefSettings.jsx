'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '@/features/i18n/I18nProvider';
import { useAuth } from '@/features/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Field, Input } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/layout/PageHeader';
import { ErrorState, ForbiddenState } from '@/components/data/States';
import { SkeletonText } from '@/components/ui/Skeleton';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatNumber, formatPercent } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import * as briefService from '@/services/brief';

/**
 * The morning brief, from the reader's side (product track, phase C).
 *
 * THE STATE FIRST. One band says whether the brief is on and when the next
 * one arrives, with the switch beside the sentence it changes.
 *
 * THE PREVIEW IS THE ARGUMENT. Beside the settings sits what today's brief
 * actually says, built by the same code that will send it and drawn like
 * the message it will be, so the owner decides on the real thing rather
 * than on a description of it.
 *
 * WhatsApp is offered only when this installation can send it; otherwise
 * the option is shown, disabled, with the reason — a hidden option leaves
 * the owner wondering whether it exists at all.
 */
export function BriefSettings() {
  const brief = useQuery({ queryKey: queryKeys.brief.detail, queryFn: briefService.getBrief });
  const data = brief.data?.data;

  if (brief.isError && brief.error?.isForbidden) return <ForbiddenState />;
  if (brief.isError) return <ErrorState error={brief.error} onRetry={brief.refetch} />;

  if (!data) {
    return (
      <Card>
        <SkeletonText lines={4} />
      </Card>
    );
  }

  // The form starts from the saved settings; a later refetch (after saving)
  // does not overwrite what the reader is in the middle of changing.
  return <BriefForm data={data} />;
}

function BriefForm({ data }) {
  const { t, tag: intlLocale } = useI18n();
  const { replaceUser } = useAuth();
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    enabled: data.enabled,
    channel: data.channel,
    phone: data.whatsapp_phone ?? '',
  });

  const save = useMutation({
    mutationFn: () =>
      briefService.updateBriefSettings({
        morning_brief: form.enabled,
        brief_channel: form.channel,
        whatsapp_phone: form.phone.trim() === '' ? null : form.phone.trim(),
      }),
    onSuccess: (response) => {
      replaceUser?.(response.data);
      queryClient.invalidateQueries({ queryKey: queryKeys.brief.all });
    },
  });

  const test = useMutation({ mutationFn: briefService.sendTestBrief });

  const dirty =
    form.enabled !== data.enabled ||
    form.channel !== data.channel ||
    form.phone.trim() !== (data.whatsapp_phone ?? '');
  const phoneError = save.error?.errors?.whatsapp_phone?.[0];
  const time = formatHour(data.hour, intlLocale);

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-(--radius-card) bg-(--color-brand-panel) p-5 text-(--color-on-brand) shadow-(--shadow-card) sm:p-6">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -end-16 -top-20 size-56 rounded-full bg-(--color-accent-on-brand) opacity-15 blur-3xl"
        />
        <label className="relative flex cursor-pointer items-center justify-between gap-5">
          <span className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-12 shrink-0 items-center justify-center rounded-2xl transition-colors duration-(--duration-base)',
                form.enabled
                  ? 'bg-(--color-accent-on-brand) text-(--color-brand-panel)'
                  : 'bg-(--color-on-brand-raise) text-(--color-on-brand-2)',
              )}
            >
              <Icon name="spark" size={22} />
            </span>
            <span>
              <span className="block text-base font-semibold">{t('brief.receive')}</span>
              <span className="mt-1 block text-sm text-(--color-on-brand-2)">
                {form.enabled
                  ? t('brief.next', { time, channel: t(`brief.${form.channel}`) })
                  : t('brief.when', { time })}
              </span>
            </span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={form.enabled}
            onChange={(event) => setForm({ ...form, enabled: event.target.checked })}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-7 w-12 shrink-0 rounded-full bg-(--color-on-brand-raise) transition-colors duration-(--duration-base) peer-checked:bg-(--color-accent-on-brand) peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-(--color-accent-on-brand) after:absolute after:start-1 after:top-1 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-transform after:duration-(--duration-base) peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5"
          />
        </label>
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
        <div className="space-y-5">
          <Card title={t('brief.channel')} icon="mail">
            <fieldset disabled={!form.enabled} className="disabled:opacity-60">
              <legend className="sr-only">{t('brief.channel')}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice
                  checked={form.channel === 'email'}
                  onChange={() => setForm({ ...form, channel: 'email' })}
                  icon="mail"
                  title={t('brief.email')}
                  detail={t('brief.emailDetail')}
                />
                <Choice
                  checked={form.channel === 'whatsapp'}
                  onChange={() => setForm({ ...form, channel: 'whatsapp' })}
                  icon="bell"
                  title={t('brief.whatsapp')}
                  detail={
                    data.whatsapp_available
                      ? t('brief.whatsappDetail')
                      : t('brief.whatsappUnavailable')
                  }
                  disabled={!data.whatsapp_available}
                />
              </div>

              {form.channel === 'whatsapp' ? (
                <Field
                  label={t('brief.phone')}
                  hint={t('brief.phoneHint', { example: '+966' })}
                  error={phoneError}
                  className="mt-4 max-w-sm"
                >
                  {(field) => (
                    <Input
                      {...field}
                      value={form.phone}
                      onChange={(event) => setForm({ ...form, phone: event.target.value })}
                      inputMode="tel"
                      dir="ltr"
                      placeholder="+966 50 123 4567"
                    />
                  )}
                </Field>
              ) : null}
            </fieldset>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-(--border-subtle) pt-4">
              <Button
                variant="primary"
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? t('common.loading') : t('brief.save')}
              </Button>
              {dirty ? (
                <span className="text-xs text-(--color-muted)">{t('brief.unsaved')}</span>
              ) : null}
              {save.isSuccess && !dirty ? (
                <span
                  role="status"
                  className="inline-flex items-center gap-1 text-sm text-(--color-success)"
                >
                  <Icon name="check" size={14} aria-hidden="true" />
                  {t('brief.saved')}
                </span>
              ) : null}
              {save.isError && !phoneError ? (
                <span role="alert" className="text-sm text-(--color-danger)">
                  {save.error?.message}
                </span>
              ) : null}
            </div>
          </Card>

          <Card title={t('brief.recent')} icon="clock">
            {data.recent?.length ? (
              <ol className="relative space-y-4 ps-5 before:absolute before:inset-y-1 before:start-[0.3rem] before:w-px before:bg-(--border-subtle)">
                {data.recent.map((delivery) => (
                  <li key={delivery.date} className="relative">
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute -start-5 top-1.5 size-2.5 rounded-full ring-4 ring-(--color-surface)',
                        delivery.status === 'sent'
                          ? 'bg-(--color-success)'
                          : delivery.status === 'failed'
                            ? 'bg-(--color-danger)'
                            : 'bg-(--color-warning)',
                      )}
                    />
                    <p className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium text-(--color-text)">
                        {formatDate(delivery.date)}
                      </span>
                      <span className="text-xs text-(--color-text-2)">
                        {t(`brief.status.${delivery.status}`)} · {t(`brief.${delivery.channel}`)}
                      </span>
                    </p>
                    {delivery.error ? (
                      <p className="mt-0.5 text-xs text-(--color-muted)">{delivery.error}</p>
                    ) : null}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-(--color-text-2)">{t('brief.noneYet')}</p>
            )}
          </Card>
        </div>

        <aside aria-label={t('brief.previewTitle')} className="lg:sticky lg:top-20">
          <div className="overflow-hidden rounded-(--radius-card) border border-(--color-line) bg-(--color-surface) shadow-(--shadow-card)">
            <div className="flex items-center justify-between gap-2 border-b border-(--border-subtle) bg-(--color-ground) px-4 py-2.5">
              <h2 className="text-sm font-semibold text-(--color-text)">
                {t('brief.previewTitle')}
              </h2>
              <span className="text-xs text-(--color-muted)">{t('brief.previewNote')}</span>
            </div>

            <BriefPreview preview={data.preview} time={time} />

            <div className="flex flex-wrap items-center gap-3 border-t border-(--border-subtle) px-4 py-3">
              <Button
                variant="secondary"
                size="sm"
                disabled={test.isPending}
                onClick={() => test.mutate()}
              >
                <Icon name="mail" size={14} aria-hidden="true" />
                {test.isPending ? t('common.loading') : t('brief.test')}
              </Button>
              {test.isSuccess ? (
                <span role="status" className="text-xs text-(--color-success)">
                  {test.data?.message}
                </span>
              ) : null}
              {test.isError ? (
                <span role="alert" className="text-xs text-(--color-danger)">
                  {test.error?.message}
                </span>
              ) : null}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/**
 * Today's brief, drawn like the message it will be: who it is from, its
 * subject, the day in one sentence, then the figures as figures.
 *
 * The figures arrive raw beside the text, already shaped by the reader's
 * role, so they are laid out as tiles rather than read as a line of prose.
 * A server that sends only the text still gets its text.
 */
export function BriefPreview({ preview, time }) {
  const { t } = useI18n();
  const figures = preview.figures;

  return (
    <div className="p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-(--color-brand-panel) text-sm font-semibold text-(--color-accent-on-brand)"
        >
          {t('brief.from').slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-(--color-text)">{t('brief.from')}</span>
            {time ? <span className="tabular text-xs text-(--color-muted)">{time}</span> : null}
          </p>
          <p className="truncate text-xs text-(--color-text-2)">{preview.subject}</p>
        </div>
      </div>

      <p className="mt-4 text-[0.95rem] leading-7 font-semibold text-(--color-text)">
        {preview.headline}
      </p>

      {preview.quiet ? (
        <p className="mt-3 rounded-xl bg-(--color-surface-selected) p-3 text-sm text-(--color-text-2)">
          {t('brief.quiet')}
        </p>
      ) : null}

      {figures ? <Figures figures={figures} /> : <TextBody preview={preview} />}
    </div>
  );
}

function Figures({ figures }) {
  const { t } = useI18n();
  const hasChange = figures.change !== null && figures.change !== undefined;

  const tiles = [
    {
      key: 'revenue',
      label: t('brief.figures.yesterday'),
      value: figures.revenue,
      detail: t('brief.figures.orders', { count: formatNumber(figures.orders) }),
      change: hasChange ? figures.change : null,
    },
    figures.gross_profit !== null && figures.orders > 0
      ? { key: 'gross', label: t('brief.figures.grossProfit'), value: figures.gross_profit }
      : null,
    { key: 'month', label: t('brief.figures.monthToDate'), value: figures.month_to_date },
    figures.receivables !== null && Number(figures.receivables) > 0
      ? { key: 'owed', label: t('brief.figures.receivables'), value: figures.receivables }
      : null,
  ].filter(Boolean);

  return (
    <>
      <dl className="mt-4 grid grid-cols-2 gap-2">
        {tiles.map((tile) => (
          <div
            key={tile.key}
            className="rounded-xl border border-(--border-subtle) bg-(--color-ground) p-3"
          >
            <dt className="text-xs text-(--color-text-2)">{tile.label}</dt>
            <dd className="tabular mt-1 truncate text-base font-semibold text-(--color-text)">
              {formatMoney(tile.value)}
            </dd>
            {tile.detail ? (
              <dd className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-(--color-muted)">
                {tile.detail}
                {tile.change !== null ? (
                  <span
                    title={t('brief.figures.vsLastWeek')}
                    className={cn(
                      'tabular rounded-full px-1.5 py-px font-medium',
                      tile.change >= 0
                        ? 'bg-(--color-success-soft) text-(--color-success)'
                        : 'bg-(--color-danger-soft) text-(--color-danger)',
                    )}
                  >
                    {formatPercent(tile.change, { decimals: 0, sign: true })}
                  </span>
                ) : null}
              </dd>
            ) : null}
          </div>
        ))}
      </dl>

      {figures.stock.length ? (
        <section className="mt-4">
          <h3 className="flex items-center gap-1.5 text-xs font-semibold text-(--color-warning)">
            <Icon name="box" size={14} aria-hidden="true" />
            {t('brief.figures.stock')}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {figures.stock.map((name) => (
              <li
                key={name}
                className="rounded-full border border-(--color-warning) bg-(--color-warning-soft) px-2.5 py-1 text-xs text-(--color-text)"
                style={{ unicodeBidi: 'plaintext' }}
              >
                {name}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {figures.actions.length ? (
        <section className="mt-4">
          <h3 className="text-xs font-semibold text-(--color-muted)">{t('brief.worthALook')}</h3>
          <ol className="mt-2 space-y-2">
            {figures.actions.map((action, index) => (
              <li
                key={action.title}
                className="flex gap-3 rounded-xl border border-(--border-subtle) p-3"
              >
                <span
                  aria-hidden="true"
                  className="tabular flex size-6 shrink-0 items-center justify-center rounded-full bg-(--color-brand-soft) text-xs font-semibold text-(--color-brand-text)"
                >
                  {formatNumber(index + 1)}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-(--color-text)">
                    {action.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-5 text-(--color-text-2)">
                    {action.message}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function TextBody({ preview }) {
  const { t } = useI18n();

  return (
    <div className="mt-2 text-sm leading-6">
      {preview.lines.map((line) => (
        <p key={line} className="text-(--color-text)">
          {line}
        </p>
      ))}
      {preview.stock ? <p className="mt-2 text-(--color-text)">{preview.stock}</p> : null}
      {preview.actions.length ? (
        <>
          <p className="mt-3 text-xs font-semibold text-(--color-muted)">{t('brief.worthALook')}</p>
          <ul className="mt-1 list-disc space-y-1 ps-5 text-(--color-text)">
            {preview.actions.map((action) => (
              <li key={action}>{action}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function Choice({ checked, onChange, icon, title, detail, disabled = false }) {
  return (
    <label
      className={cn(
        'relative flex items-start gap-3 rounded-xl border p-4 transition-[border-color,background-color,box-shadow] duration-(--duration-base)',
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        checked
          ? 'border-(--color-brand) bg-(--color-brand-soft) ring-1 ring-(--color-brand)'
          : 'border-(--color-line) hover:border-(--color-line-strong) hover:bg-(--color-surface-hover)',
        'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-(--focus-ring)',
      )}
    >
      <input
        type="radio"
        name="brief-channel"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="sr-only"
      />
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-lg',
          checked
            ? 'bg-(--color-brand) text-(--color-text-inverse)'
            : 'bg-(--color-surface-selected) text-(--color-text-2)',
        )}
      >
        <Icon name={icon} size={16} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-(--color-text)">{title}</span>
        <span className="mt-0.5 block text-xs text-(--color-text-2)">{detail}</span>
      </span>
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
          checked ? 'border-(--color-brand)' : 'border-(--color-line-strong)',
        )}
      >
        {checked ? <span className="size-2 rounded-full bg-(--color-brand)" /> : null}
      </span>
    </label>
  );
}

/**
 * The hour the way the reader's locale writes a time: "8 AM", "٨ ص". Written
 * out of the sentence rather than into it, so Arabic text carries no digits
 * of its own and the reader's numeral choice always applies.
 */
function formatHour(hour, locale) {
  const date = new Date(2026, 0, 1, hour, 0, 0);

  try {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric' }).format(date);
  } catch {
    return String(hour);
  }
}
