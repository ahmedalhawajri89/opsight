'use client';

import { cn } from '@/lib/cn';
import {
  COMPARISON,
  PRESETS,
  PRESET_LABEL_COUNTS,
  describePeriod,
  isPartialPeriod,
  resolvePreset,
} from '@/lib/periods';
import { DateInput, Select } from '@/components/ui/Field';
import { PartialBadge } from '@/components/ui/Badge';
import { useI18n } from '@/features/i18n/I18nProvider';

/**
 * The global period selector.
 *
 * It lives in the topbar rather than on each page because the period applies
 * across dashboard, analytics and most tables — making it per-page would have
 * users setting the same range over and over (UI_UX_DIRECTION.md §5).
 *
 * Presets are resolved here only so the UI can label and submit them. The
 * SERVER resolves the resulting dates into instants in the business timezone
 * and owns every metric boundary (METRICS.md §1.2).
 */
export function PeriodSelector({
  preset = PRESETS.Last30,
  from,
  to,
  comparison = COMPARISON.PreviousPeriod,
  fiscalStartMonth = 1,
  onChange,
  /*
   * A page that states the resolved range and the partial-period status
   * elsewhere — the dashboard puts both in its header and context banner —
   * turns these off rather than saying the same thing twice in one line.
   */
  showRange = true,
  showPartial = true,
  className,
}) {
  const { t } = useI18n();

  const resolved =
    preset === PRESETS.Custom && from && to
      ? { from, to }
      : resolvePreset(preset, { fiscalStartMonth });

  const partial = isPartialPeriod(resolved.to);

  function handlePreset(nextPreset) {
    if (nextPreset === PRESETS.Custom) {
      onChange?.({ preset: nextPreset, ...resolved, comparison });

      return;
    }

    onChange?.({
      preset: nextPreset,
      ...resolvePreset(nextPreset, { fiscalStartMonth }),
      comparison,
    });
  }

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      <Select
        aria-label={t('period.selector.period')}
        value={preset}
        onChange={(event) => handlePreset(event.target.value)}
        options={Object.values(PRESETS).map((value) => ({
          value,
          label: t(`period.presets.${value}`, { count: PRESET_LABEL_COUNTS[value] }),
        }))}
        className="h-9 w-auto min-w-36"
      />

      {preset === PRESETS.Custom && (
        <>
          <DateInput
            aria-label={t('period.selector.from')}
            value={resolved.from ?? ''}
            max={resolved.to ?? undefined}
            onChange={(event) =>
              onChange?.({ preset, from: event.target.value, to: resolved.to, comparison })
            }
            className="h-9 w-auto"
          />
          <span className="text-(--color-muted)" aria-hidden="true">
            –
          </span>
          <DateInput
            aria-label={t('period.selector.to')}
            value={resolved.to ?? ''}
            min={resolved.from ?? undefined}
            onChange={(event) =>
              onChange?.({ preset, from: resolved.from, to: event.target.value, comparison })
            }
            className="h-9 w-auto"
          />
        </>
      )}

      <Select
        aria-label={t('period.selector.comparison')}
        value={comparison}
        onChange={(event) => onChange?.({ preset, ...resolved, comparison: event.target.value })}
        options={Object.values(COMPARISON).map((value) => ({
          value,
          label: t(`period.comparisons.${value}`),
        }))}
        className="h-9 w-auto min-w-44"
      />

      {/* The resolved range is shown, so the preset is never ambiguous. */}
      {showRange && (
        <span className="tabular hidden text-sm text-(--color-text-2) lg:inline">
          {describePeriod(resolved.from, resolved.to)}
        </span>
      )}

      {showPartial && partial && <PartialBadge />}
    </div>
  );
}
