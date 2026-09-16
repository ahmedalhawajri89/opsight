<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

enum Comparison: string
{
    case PreviousPeriod = 'previous_period';
    case PreviousYear = 'previous_year';
    case None = 'none';

    public function label(): string
    {
        return match ($this) {
            self::PreviousPeriod => 'Previous period',
            self::PreviousYear => 'Same period last year',
            self::None => 'No comparison',
        };
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
        return match ($this) {
            self::PreviousPeriod => "vs previous {$period->lengthInDays()} days",
            self::PreviousYear => 'vs same period last year',
            self::None => '',
        };
    }
}
