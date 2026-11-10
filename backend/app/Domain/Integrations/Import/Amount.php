<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Import;

/**
 * A money value out of whatever a store sends, as a bcmath string
 * (ADR-015).
 *
 * Stores are inconsistent about this. Zid sends some amounts as JSON numbers
 * carrying float noise (`199.55999896568`) and others as long decimal
 * strings (`'86956.52128843400000'`). Both become decimal strings without
 * passing a string through a float on the way.
 *
 * NOT ROUNDED HERE, and that is deliberate. Rounding to four places and then
 * again to the currency's three is double rounding: `13.04347…` becomes
 * `13.0435`, then `13.044`, when the right answer is `13.043`. The value
 * keeps ten places and is rounded exactly once, by whoever writes it.
 */
final class Amount
{
    private const SCALE = 10;

    /**
     * @param  mixed  $value  a number, a numeric string, or anything else
     * @param  string|null  $default  returned when there is no amount to read;
     *                                passed explicitly, because whether absent
     *                                means zero is the caller's decision
     */
    public static function of(mixed $value, ?string $default = '0'): ?string
    {
        if (is_int($value)) {
            return (string) $value;
        }

        if (is_float($value)) {
            $value = number_format($value, self::SCALE, '.', '');
        }

        if (! is_string($value) || ! is_numeric(trim($value))) {
            return $default;
        }

        $normalised = bcadd(trim($value), '0', self::SCALE);

        // Trailing zeros off, so '15.0000000000' reads back as '15'.
        return str_contains($normalised, '.') ? rtrim(rtrim($normalised, '0'), '.') : $normalised;
    }
}
