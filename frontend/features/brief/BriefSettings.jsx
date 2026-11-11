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
import { formatDate } from '@/lib/format';
import { queryKeys } from '@/lib/queryKeys';
import * as briefService from '@/services/brief';

/**
 * The morning brief, from the reader's side (product track, phase C).
 *
 * THE PREVIEW IS THE ARGUMENT. Beside the switch sits what today's brief
 * actually says, built by the same code that will send it, so the owner
 * decides on the real thing rather than on a description of it.
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
    form.enabled !== data.enabled || form.channel !== data.channel || form.phone.trim() !== (data.whatsapp_phone ?? '');
  const phoneError = save.error?.errors?.whatsapp_phone?.[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="space-y-5">
        <Card>
          <label className="flex cursor-pointer items-start justify-between gap-4">
            <span>
              <span className="block text-sm font-semibold text-(--color-text)">{t('brief.receive')}</span>
              <span className="mt-1 block text-sm text-(--color-text-2)">
                {t('brief.when', { time: formatHour(data.hour, intlLocale) })}
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
              className="relative mt-0.5 h-6 w-11 shrink-0 rounded-full bg-(--color-surface-selected) transition-colors peer-checked:bg-(--color-brand) peer-focus-visible:ring-2 peer-focus-visible:ring-(--color-brand) after:absolute after:top-0.5 after:start-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition-all peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5"
            />
          </label>

          <fieldset className="mt-5" disabled={!form.enabled}>
            <legend className="text-sm font-medium text-(--color-text)">{t('brief.channel')}</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                detail={data.whatsapp_available ? t('brief.whatsappDetail') : t('brief.whatsappUnavailable')}
                disabled={!data.whatsapp_available}
              />
            </div>

            {form.channel === 'whatsapp' ? (
              <Field label={t('brief.phone')} hint={t('brief.phoneHint', { example: '+966' })} error={phoneError} className="mt-4 max-w-sm">
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

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Button variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? t('common.loading') : t('brief.save')}
            </Button>
            {save.isSuccess && !dirty ? (
              <span role="status" className="inline-flex items-center gap-1 text-sm text-(--color-success)">
                <Icon name="check" size={14} aria-hidden="true" />
                {t('brief.saved')}
              </span>
            ) : null}
            {save.isError && !phoneError ? (
              <span role="alert" className="text-sm text-(--color-danger)">{save.error?.message}</span>
            ) : null}
          </div>
        </Card>

        {data.recent?.length ? (
          <Card>
            <h2 className="text-sm font-semibold text-(--color-text)">{t('brief.recent')}</h2>
            <ul className="mt-3 divide-y divide-(--border-subtle)">
              {data.recent.map((delivery) => (
                <li key={delivery.date} className="flex items-start justify-between gap-3 py-2 text-sm">
                  <span className="text-(--color-text-2)">{formatDate(delivery.date)}</span>
                  <span className="text-end">
                    <span className={delivery.status === 'sent' ? 'text-(--color-success)' : 'text-(--color-danger)'}>
                      {t(`brief.status.${delivery.status}`)}
                    </span>
                    <span className="text-(--color-muted)"> · {t(`brief.${delivery.channel}`)}</span>
                    {delivery.error ? <span className="block text-xs text-(--color-muted)">{delivery.error}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <aside aria-label={t('brief.previewTitle')}>
        <Card>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-(--color-text)">{t('brief.previewTitle')}</h2>
            <span className="text-xs text-(--color-muted)">{t('brief.previewNote')}</span>
          </div>

          <BriefPreview preview={data.preview} />

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-(--border-subtle) pt-4">
            <Button variant="secondary" size="sm" disabled={test.isPending} onClick={() => test.mutate()}>
              <Icon name="mail" size={14} aria-hidden="true" />
              {test.isPending ? t('common.loading') : t('brief.test')}
            </Button>
            {test.isSuccess ? (
              <span role="status" className="text-xs text-(--color-success)">{test.data?.message}</span>
            ) : null}
            {test.isError ? <span role="alert" className="text-xs text-(--color-danger)">{test.error?.message}</span> : null}
          </div>
        </Card>
      </aside>
    </div>
  );
}

/** Today's brief, drawn like the message it will be. */
export function BriefPreview({ preview }) {
  const { t } = useI18n();

  return (
    <div dir="auto" className="mt-3 rounded-xl border border-(--border-subtle) bg-(--color-surface-selected) p-4 text-sm leading-6">
      <p className="text-xs text-(--color-muted)">{preview.subject}</p>
      <p className="mt-2 font-semibold text-(--color-text)">{preview.headline}</p>
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
      {preview.quiet ? <p className="mt-2 text-(--color-muted)">{t('brief.quiet')}</p> : null}
    </div>
  );
}

function Choice({ checked, onChange, icon, title, detail, disabled = false }) {
  return (
    <label
      className={`flex items-start gap-3 rounded-xl border p-3 transition-colors ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      } ${checked ? 'border-(--color-brand) bg-(--color-brand-soft)' : 'border-(--border) hover:bg-(--color-surface-selected)'}`}
    >
      <input type="radio" name="brief-channel" checked={checked} onChange={onChange} disabled={disabled} className="sr-only" />
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--color-brand-soft) text-(--color-brand-text)">
        <Icon name={icon} size={16} aria-hidden="true" />
      </span>
      <span>
        <span className="block text-sm font-medium text-(--color-text)">{title}</span>
        <span className="mt-0.5 block text-xs text-(--color-text-2)">{detail}</span>
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
