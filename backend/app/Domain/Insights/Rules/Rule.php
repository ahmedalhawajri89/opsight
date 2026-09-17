<?php

declare(strict_types=1);

namespace App\Domain\Insights\Rules;

use App\Domain\Insights\InsightRule;

/**
 * Shared plumbing for the rule set.
 *
 * Only two things live here — config access and number formatting — because a
 * base class that grows helpers becomes the place rules quietly start sharing
 * logic, and shared logic between rules is how two of them end up asserting
 * contradictory things about the same figure.
 */
abstract class Rule implements InsightRule
{
    public function requiresCost(): bool
    {
        return false;
    }

    public function isPointInTime(): bool
    {
        return false;
    }

    /** This rule's slice of config/insights.php. */
    protected function config(string $key, float|int $default): float|int
    {
        $value = config('insights.rules.'.$this->id().'.'.$key, $default);

        return is_numeric($value) ? $value + 0 : $default;
    }

    /**
     * A ratio as a percentage, to one decimal place.
     *
     * One place, not two: a dashboard sentence saying "revenue fell 18.4%"
     * reads as a fact, and "18.43%" reads as a spurious precision the
     * underlying sample does not support.
     */
    protected function pct(float $ratio): string
    {
        return number_format(abs($ratio) * 100, 1);
    }

    /**
     * Percentage POINTS, which is what the difference between two ratios is.
     *
     * Calling a margin move from 38% to 34% "a 10.5% fall" is a different and
     * wrong claim; it is a 4-point fall (METRICS.md §1.5).
     */
    protected function points(float $delta): string
    {
        return number_format(abs($delta) * 100, 1);
    }
}
