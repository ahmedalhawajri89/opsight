'use client';

import { useState } from 'react';

import { Icon } from '@/components/ui/Icon';
import { getFormatLocale } from '@/lib/format';

/**
 * Today, in both calendars a Gulf merchant keeps: "الأربعاء 11 نوفمبر ·
 * 20 جمادى الأولى 1448".
 *
 * Display only. Periods, comparisons and every Hijri range a figure rests on
 * come from the server (lib/periods.js says why). This names the day, through
 * the same Umm al-Qura calendar the server uses, via the browser's own ICU.
 * It is read once, when the shell mounts, so a render stays pure. It steps
 * aside when a page puts its own controls in the bar (the dashboard's period),
 * which need the room more.
 */
export function TodayChip() {
  const [today] = useState(() => new Date());
  const locale = getFormatLocale();

  const gregorian = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(today);

  let hijri = null;

  try {
    /*
     * Through Intl.Locale, not by appending "-u-ca-…" to the tag: the tag
     * may already carry an extension (the reader's digits, "-u-nu-latn"),
     * and a second "-u-" makes it invalid, so the Hijri date silently fell
     * away.
     */
    const calendar = new Intl.Locale(locale, { calendar: 'islamic-umalqura' });

    hijri = new Intl.DateTimeFormat(calendar, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(today);
  } catch {
    // A browser without the calendar shows the Gregorian date alone.
  }

  return (
    <p className="hidden items-center gap-2 rounded-(--radius-pill) border border-(--color-line) bg-(--color-ground) px-3 py-1.5 text-xs whitespace-nowrap text-(--color-text-2) xl:inline-flex [header:has([data-topbar-slot]:not(:empty))_&]:hidden">
      <Icon name="calendar" size={14} className="text-(--color-brand-text)" aria-hidden="true" />
      <span className="font-medium text-(--color-text)">{gregorian}</span>
      {hijri ? (
        <>
          <span aria-hidden="true" className="h-3 w-px bg-(--color-line-strong)" />
          <span>{hijri}</span>
        </>
      ) : null}
    </p>
  );
}
