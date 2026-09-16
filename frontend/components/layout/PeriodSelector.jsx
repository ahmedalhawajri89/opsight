'use client';

import { cn } from '@/lib/cn';
import {
  COMPARISON,
  COMPARISON_LABELS,
  PRESETS,
  PRESET_LABELS,
  describePeriod,
  isPartialPeriod,
  resolvePreset,
} from '@/lib/periods';
import { DateInput, Select } from '@/components/ui/Field';
import { PartialBadge } from '@/components/ui/Badge';

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
  className,
}) {
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
        aria-label="Period"
        value={preset}
        onChange={(event) => handlePreset(event.target.value)}
        options={Object.values(PRESETS).map((value) => ({
          value,
          label: PRESET_LABELS[value],
        }))}
        className="w-auto"
      />

      {preset === PRESETS.Custom && (
        <>
          <DateInput
            aria-label="From date"
            value={resolved.from ?? ''}
            max={resolved.to ?? undefined}
            onChange={(event) =>
              onChange?.({ preset, from: event.target.value, to: resolved.to, comparison })
            }
            className="w-auto"
          />
          <span className="text-[--color-text-subtle]" aria-hidden="true">
            –
          </span>
          <DateInput
            aria-label="To date"
            value={resolved.to ?? ''}
            min={resolved.from ?? undefined}
            onChange={(event) =>
              onChange?.({ preset, from: resolved.from, to: event.target.value, comparison })
            }
            className="w-auto"
          />
        </>
      )}

      <Select
        aria-label="Comparison"
        value={comparison}
        onChange={(event) => onChange?.({ preset, ...resolved, comparison: event.target.value })}
        options={Object.values(COMPARISON).map((value) => ({
          value,
          label: COMPARISON_LABELS[value],
        }))}
        className="w-auto"
      />

      {/* The resolved range is always shown, so the preset is never ambiguous. */}
      <span className="tabular hidden text-[0.8125rem] text-[--color-text-muted] lg:inline">
        {describePeriod(resolved.from, resolved.to)}
      </span>

      {partial && <PartialBadge />}
    </div>
  );
}
