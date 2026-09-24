import { getFormatLocale } from '@/lib/format';

/**
 * The seven days, ISO-numbered (1 = Monday … 7 = Sunday) as the API stores
 * them, named in the reader's language. 1 January 2024 was a Monday.
 */
export function weekdayOptions() {
  const formatter = new Intl.DateTimeFormat(getFormatLocale(), {
    weekday: 'long',
    timeZone: 'UTC',
  });

  return Array.from({ length: 7 }, (_, index) => ({
    value: String(index + 1),
    label: formatter.format(new Date(Date.UTC(2024, 0, index + 1))),
  }));
}
