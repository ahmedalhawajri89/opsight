'use client';

import { DateInput } from '@/components/ui/Field';
import { Icon } from '@/components/ui/Icon';
import { useI18n } from '@/features/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { figureDirection } from '@/lib/format';
import {
  COMPARISON,
  PRESETS,
  PRESET_LABEL_COUNTS,
  describePeriod,
  resolvePreset,
} from '@/lib/periods';

/**
 * The dashboard's period, as the top bar shows it: a date range button and a
 * comparison pill.
 *
 * Each is a NATIVE select laid transparently over its visible face. The face
 * shows what the reader wants to see — the resolved dates, "vs. previous 30
 * days" — while the control underneath is the platform's own: keyboard, screen
 * reader and mobile picker behaviour come for free, and the accessible names
 * ("Period", "Comparison") are unchanged from the selector this replaced.
 */
export function PeriodControls({
  preset,
  from,
  to,
  comparison,
  comparisonLabel,
  resolvedPeriod,
  fiscalStartMonth = 1,
  onChange,
}) {
  const { t } = useI18n();

  const resolved =
    preset === PRESETS.Custom ? { from, to } : resolvePreset(preset, { fiscalStartMonth });

  // The server's resolved window when it has answered — it knows the business
  // timezone and fiscal year — and the client's own until then.
  const shown = resolvedPeriod ?? resolved;
  const range = describePeriod(shown.from, shown.to);

  function choosePreset(next) {
    if (next === PRESETS.Custom) {
      onChange({ preset: next, from: resolved.from, to: resolved.to, comparison });
      return;
    }

    onChange({ preset: next, ...resolvePreset(next, { fiscalStartMonth }), comparison });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Face>
        <Icon name="calendar" size={16} className="shrink-0 text-(--color-text-2)" />
        <bdi dir={figureDirection(range)} className="tabular truncate">
          {range}
        </bdi>
        <Icon name="chevronDown" size={14} className="shrink-0 text-(--color-muted)" />
        <select
          aria-label={t('period.selector.period')}
          value={preset}
          onChange={(event) => choosePreset(event.target.value)}
          className={OVERLAY}
        >
          {Object.values(PRESETS).map((value) => (
            <option key={value} value={value}>
              {t(`period.presets.${value}`, { count: PRESET_LABEL_COUNTS[value] })}
            </option>
          ))}
        </select>
      </Face>

      {preset === PRESETS.Custom && (
        <div className="flex items-center gap-1.5">
          <DateInput
            aria-label={t('period.selector.from')}
            value={resolved.from ?? ''}
            max={resolved.to ?? undefined}
            onChange={(event) =>
              onChange({ preset, from: event.target.value, to: resolved.to, comparison })
            }
            className="h-9 w-auto"
          />
          <span aria-hidden="true" className="text-(--color-muted)">
            –
          </span>
          <DateInput
            aria-label={t('period.selector.to')}
            value={resolved.to ?? ''}
            min={resolved.from ?? undefined}
            onChange={(event) =>
              onChange({ preset, from: resolved.from, to: event.target.value, comparison })
            }
            className="h-9 w-auto"
          />
        </div>
      )}

      <Face subtle>
        <span className="truncate">{comparisonLabel || t(`period.comparisons.${comparison}`)}</span>
        <select
          aria-label={t('period.selector.comparison')}
          value={comparison}
          onChange={(event) => onChange({ preset, ...resolved, comparison: event.target.value })}
          className={OVERLAY}
        >
          {Object.values(COMPARISON).map((value) => (
            <option key={value} value={value}>
              {t(`period.comparisons.${value}`)}
            </option>
          ))}
        </select>
      </Face>
    </div>
  );
}

const OVERLAY = 'absolute inset-0 size-full cursor-pointer appearance-none opacity-0';

function Face({ subtle = false, children }) {
  return (
    <label
      className={cn(
        // focus-within draws the ring the invisible select cannot show itself.
        'relative flex h-9 min-w-0 items-center gap-2 border bg-(--color-surface) px-3 whitespace-nowrap transition-colors duration-(--duration-fast) has-[select:focus-visible]:outline-2 has-[select:focus-visible]:outline-offset-2 has-[select:focus-visible]:outline-(--focus-ring)',
        subtle
          ? 'rounded-full border-(--color-line) text-xs text-(--color-text-2) hover:border-(--color-line-strong)'
          : 'rounded-(--radius-control) border-(--color-line) text-sm font-medium text-(--color-text) hover:border-(--color-line-strong)',
      )}
    >
      {children}
    </label>
  );
}
