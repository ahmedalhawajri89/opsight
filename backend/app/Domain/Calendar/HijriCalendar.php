<?php

declare(strict_types=1);

namespace App\Domain\Calendar;

use Carbon\Carbon;
use IntlCalendar;
use RuntimeException;

/**
 * The Hijri calendar, for comparing a season with the same season a year ago.
 *
 * Ramadan moves about eleven days earlier every Gregorian year, so "the same
 * period last year" compares Ramadan with ordinary trade in most years — and
 * reports a collapse or a surge that is only the calendar. Comparing by Hijri
 * date puts Ramadan against Ramadan and Eid against Eid.
 *
 * Umm al-Qura, the official calendar of Saudi Arabia, through ICU's
 * `islamic-umalqura` — already present in PHP's intl extension, so no library
 * is added. Where a country's observance follows a local moon sighting, the
 * actual first day of Ramadan or Eid can differ from it by a day; for comparing
 * weeks and months of trade, that day does not move a conclusion.
 *
 * Dates in and out are business-local `Y-m-d` strings. Conversions happen at
 * noon UTC, so no timezone offset can push a date across midnight.
 */
final class HijriCalendar
{
    /** Hijri month numbers, 1-based. */
    private const RAMADAN = 9;

    private const SHAWWAL = 10;

    private const DHU_AL_HIJJAH = 12;

    /** The same Hijri day, `$years` Hijri years away. */
    public static function shiftYears(string $date, int $years): string
    {
        $calendar = self::calendar();
        $calendar->setTime(self::noonMillis($date));
        // ICU clamps the day when the target month is shorter (30 → 29).
        $calendar->add(IntlCalendar::FIELD_YEAR, $years);

        return self::toDate($calendar);
    }

    /** @return array{year: int, month: int, day: int} */
    public static function toHijri(string $date): array
    {
        $calendar = self::calendar();
        $calendar->setTime(self::noonMillis($date));

        return [
            'year' => $calendar->get(IntlCalendar::FIELD_YEAR),
            'month' => $calendar->get(IntlCalendar::FIELD_MONTH) + 1,
            'day' => $calendar->get(IntlCalendar::FIELD_DAY_OF_MONTH),
        ];
    }

    public static function toGregorian(int $year, int $month, int $day): string
    {
        $calendar = self::calendar();
        $calendar->clear();
        $calendar->set($year, $month - 1, $day, 12, 0, 0);

        return self::toDate($calendar);
    }

    /**
     * The seasons that fall inside a date range, each clipped to it.
     *
     * Ramadan, Eid al-Fitr (1–3 Shawwal) and Eid al-Adha (10–13 Dhu al-Hijjah):
     * the three periods that visibly change trade across the region.
     *
     * @return list<array{key: string, from: string, to: string}>
     */
    public static function seasonsBetween(string $from, string $to): array
    {
        $seasons = [];
        $first = self::toHijri($from)['year'];
        $last = self::toHijri($to)['year'];

        for ($year = $first; $year <= $last; $year++) {
            $windows = [
                ['ramadan', self::toGregorian($year, self::RAMADAN, 1),
                    Carbon::parse(self::toGregorian($year, self::SHAWWAL, 1))->subDay()->toDateString()],
                ['eid_al_fitr', self::toGregorian($year, self::SHAWWAL, 1), self::toGregorian($year, self::SHAWWAL, 3)],
                ['eid_al_adha', self::toGregorian($year, self::DHU_AL_HIJJAH, 10), self::toGregorian($year, self::DHU_AL_HIJJAH, 13)],
            ];

            foreach ($windows as [$key, $start, $end]) {
                if ($end < $from || $start > $to) {
                    continue;
                }

                $seasons[] = ['key' => $key, 'from' => max($start, $from), 'to' => min($end, $to)];
            }
        }

        usort($seasons, fn (array $a, array $b): int => strcmp($a['from'], $b['from']));

        return $seasons;
    }

    private static function calendar(): IntlCalendar
    {
        $calendar = IntlCalendar::createInstance('UTC', 'en_US@calendar=islamic-umalqura');

        // An ICU build without this calendar does not fail: it quietly hands
        // back a Gregorian one, and every "Hijri" comparison would be off by a
        // year's worth of drift. Refuse instead.
        if ($calendar->getType() !== 'islamic-umalqura') {
            throw new RuntimeException('The Umm al-Qura calendar is unavailable in this ICU build.');
        }

        return $calendar;
    }

    private static function noonMillis(string $date): float
    {
        return (float) Carbon::parse($date.' 12:00:00', 'UTC')->getTimestampMs();
    }

    private static function toDate(IntlCalendar $calendar): string
    {
        return Carbon::createFromTimestampMs((int) $calendar->getTime(), 'UTC')->toDateString();
    }
}
