<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Support\Localization\Localizer;

enum Comparison: string
{
    case PreviousPeriod = 'previous_period';
    case PreviousYear = 'previous_year';
    // The same Hijri dates a Hijri year ago: Ramadan against Ramadan (HijriCalendar).
    case PreviousHijriYear = 'previous_hijri_year';
    case None = 'none';

    public function label(): string
    {
        return __('labels.comparison.'.$this->value);
    }

    /**
     * The phrase shown beside a figure.
     *
     * A bare percentage with no stated basis is not a comparison, it is a
     * rumour — every tile says what it is comparing against
     * (UI_UX_DIRECTION.md §6).
     */
    public function describe(Period $period): string
    {
        $days = $period->lengthInDays();

        // The grammatical form follows the raw count; the count shown is in
        // the reader's digits.
        return match ($this) {
            self::PreviousPeriod => trans_choice('labels.versus.previous_days', $days, [
                'days' => app(Localizer::class)->number($days),
            ]),
            self::PreviousYear => __('labels.versus.previous_year'),
            self::PreviousHijriYear => __('labels.versus.previous_hijri_year'),
            self::None => '',
        };
    }
}
