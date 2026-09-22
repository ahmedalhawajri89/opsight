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
      <p className="measure min-w-0 flex-1">
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
