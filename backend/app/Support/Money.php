<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\BusinessSetting;

/**
 * The single source of money precision.
 *
 * Every rounding, sum and comparison of an amount takes its decimal places
 * from here, and here takes them from the business's currency — 2 for SAR,
 * AED and QAR; 3 for BHD, KWD, OMR and JOD.
 *
 * Before this existed the number 2 was written into every calculation, while
 * `currency_decimals` reached only the display. The product's own default
 * currency, BHD, therefore lost its third decimal in every stored total and
 * every metric, and showed the loss padded with a zero: a line of 1.255 BHD
 * was stored as 1.26 and displayed as 1.260. METRICS.md always said amounts
 * round to the currency's places; now the code does.
 *
 * Storage is DECIMAL(15,3) for totals — enough for any supported currency —
 * and every value written is first rounded here to the currency's own places,
 * so a two-decimal currency still stores two meaningful decimals.
 */
final class Money
{
    /** The largest precision a currency may declare (SettingsController validates 0–3). */
    public const MAX_SCALE = 3;

    /** Decimal places of the business's currency. */
    public static function scale(): int
    {
        return (int) BusinessSetting::current()->currency_decimals;
    }

    /**
     * Zero, written at the currency's places — "0.00" for SAR, "0.000" for
     * BHD — so an empty period reads like every other figure beside it.
     */
    public static function zero(): string
    {
        return self::round('0');
    }

    /**
     * Half-up (away from zero) to the currency's places, on strings. Money
     * never touches a PHP float.
     *
     * bcmath truncates, so the half-unit is added first: to two places that is
     * 0.005, to three 0.0005.
     */
    public static function round(string $value, ?int $scale = null): string
    {
        $scale ??= self::scale();
        $half = '0.'.str_repeat('0', $scale).'5';
        $offset = bccomp($value, '0', 10) >= 0 ? $half : '-'.$half;

        return bcadd($value, $offset, $scale);
    }
}
