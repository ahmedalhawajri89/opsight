<?php

declare(strict_types=1);

use App\Domain\Calendar\HijriCalendar;

/*
|--------------------------------------------------------------------------
| The Hijri calendar (Umm al-Qura, through ICU)
|--------------------------------------------------------------------------
|
| Anchored to dates that are public record, so a broken ICU build — or one
| that silently falls back to Gregorian — fails here rather than in a report.
|
*/

it('places Ramadan and the Eids on their Umm al-Qura dates', function (int $year, string $ramadan, string $fitr, string $adha): void {
    expect(HijriCalendar::toGregorian($year, 9, 1))->toBe($ramadan)
        ->and(HijriCalendar::toGregorian($year, 10, 1))->toBe($fitr)
        ->and(HijriCalendar::toGregorian($year, 12, 10))->toBe($adha);
})->with([
    '1445' => [1445, '2024-03-11', '2024-04-10', '2024-06-16'],
    '1446' => [1446, '2025-03-01', '2025-03-30', '2025-06-06'],
    '1447' => [1447, '2026-02-18', '2026-03-20', '2026-05-27'],
]);

it('converts a Gregorian date to its Hijri date', function (): void {
    expect(HijriCalendar::toHijri('2026-03-01'))->toBe(['year' => 1447, 'month' => 9, 'day' => 12]);
});

it('shifts a date back one Hijri year — about eleven days earlier than a Gregorian year', function (): void {
    // 12 Ramadan 1447 → 12 Ramadan 1446.
    expect(HijriCalendar::shiftYears('2026-03-01', -1))->toBe('2025-03-12');
});

it('finds the seasons inside a range, clipped to it', function (): void {
    expect(HijriCalendar::seasonsBetween('2026-03-01', '2026-03-31'))->toBe([
        ['key' => 'ramadan', 'from' => '2026-03-01', 'to' => '2026-03-19'],
        ['key' => 'eid_al_fitr', 'from' => '2026-03-20', 'to' => '2026-03-22'],
    ]);
});

it('finds no season in ordinary trade', function (): void {
    expect(HijriCalendar::seasonsBetween('2026-08-01', '2026-08-31'))->toBe([]);
});
