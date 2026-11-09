'use client';

import { useI18n } from '@/features/i18n/I18nProvider';
import { getFormatLocale } from '@/lib/format';
import { COMPARISON } from '@/lib/periods';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

/**
 * "Part of this change is the calendar, not the business."
 *
 * Raised when the server reports that the period and its comparison hold
 * different amounts of Ramadan or Eid (`meta.comparison.season_mismatch`) —
 * March 2026 against March 2025, say, where one was mostly Ramadan and the
 * other nineteen days of it and then Eid. It names the seasons on each side
 * and offers the one comparison that fixes it: the same Hijri dates a year
 * earlier. The server decides; this only says so and hands over the switch.
 */
export function SeasonNotice({ meta, onUseHijri }) {
  const { t } = useI18n();

  if (!meta?.comparison?.season_mismatch) return null;

  const names = (seasons = []) => {
    const keys = [...new Set(seasons.map((season) => season.key))];

    return keys.length === 0
      ? t('season.none')
      : new Intl.ListFormat(getFormatLocale(), { type: 'conjunction' }).format(
          keys.map((key) => t(`season.names.${key}`)),
        );
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 rounded-(--radius-card) border border-(--color-line) bg-(--color-accent-soft) px-4 py-3 text-sm text-(--color-text)"
    >
      <Icon name="calendar" size={16} className="shrink-0 text-(--color-accent-strong)" />
      {/*
        `basis-64`, and without it `flex-wrap` above never wraps anything.

        A `flex-1` item has a flex-basis of 0, so the row's natural width is
        whatever the BUTTON needs and the sentence is simply squeezed into
        the remainder. On a 390px phone that remainder was about one word
        wide: this notice rendered as a vertical column of single words —
        "This / period / holds / neither;" — roughly 550px tall for one
        sentence, with the button sitting beside it in full.

        A real basis gives the paragraph a width to be measured against, so
        the row wraps the button onto its own line once the two no longer fit
        side by side. `flex-1` still lets it take the leftover on a desk.
      */}
      <p className="measure min-w-0 flex-1 basis-64">
        {t('season.mismatch', {
          current: names(meta.seasons),
          previous: names(meta.comparison.seasons),
        })}
      </p>
      <Button
        size="sm"
        variant="secondary"
        onClick={() => onUseHijri(COMPARISON.PreviousHijriYear)}
      >
        {t('season.useHijri')}
      </Button>
    </div>
  );
}
