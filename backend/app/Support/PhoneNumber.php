<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Phone numbers in one form: E.164, "+" and digits (ADR-021).
 *
 * People type numbers every way — "3600 1234", "+973 3600-1234",
 * "00973 36001234". Stored as typed, the same customer's number never matches
 * itself, and nothing downstream (a WhatsApp message, a duplicate check) can
 * use it. Normalised once, on the way in:
 *
 *   - spaces, dashes, dots and brackets are dropped;
 *   - a leading 00 becomes +;
 *   - a number with no country code takes the customer's country's code, and
 *     loses a leading trunk 0 (Saudi and Egyptian mobiles are written 05… and
 *     01… locally);
 *   - the result must be + and 8 to 15 digits, or it is refused.
 *
 * No library: the region is known, the rules are few, and this refuses what it
 * cannot place rather than guessing.
 */
final class PhoneNumber
{
    /** Calling codes for the countries Opsight serves, by ISO 3166 alpha-2. */
    public const CALLING_CODES = [
        'BH' => '973',
        'SA' => '966',
        'AE' => '971',
        'KW' => '965',
        'QA' => '974',
        'OM' => '968',
        'EG' => '20',
        'JO' => '962',
        'MA' => '212',
    ];

    /** The E.164 form, or null when the input cannot be read as a number. */
    public static function normalize(string $raw, ?string $country = null): ?string
    {
        $number = preg_replace('/[\s\-\.\(\)]/u', '', $raw) ?? '';

        if (str_starts_with($number, '00')) {
            $number = '+'.substr($number, 2);
        }

        if (! str_starts_with($number, '+')) {
            $code = self::CALLING_CODES[strtoupper((string) $country)] ?? null;

            if ($code === null) {
                return null;
            }

            $number = '+'.$code.ltrim($number, '0');
        }

        return preg_match('/^\+[1-9]\d{7,14}$/', $number) === 1 ? $number : null;
    }
}
