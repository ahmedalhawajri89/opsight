<?php

declare(strict_types=1);

namespace App\Support\Localization;

use NumberFormatter;

/**
 * The reader's language and digits for the current request, and the number
 * formatting that depends on them.
 *
 * The server writes whole sentences — "Net revenue fell 22.4% against the
 * previous 30 days" — and a number inside a sentence has to be formatted in the
 * reader's locale AND numbering system, or an Arabic sentence arrives carrying
 * "22.4" where it should say "٢٢٫٤". Sentences therefore take their figures
 * from here rather than from number_format(), which knows neither.
 *
 * Scoped to the request (see AppServiceProvider) and set once by the SetLocale
 * middleware. Outside HTTP — a queued job, a console command — it defaults to
 * English with Western digits, and a caller acting for a specific user sets it
 * from that user explicitly.
 */
final class Localizer
{
    public const LOCALES = ['en', 'ar'];

    public const NUMERALS = ['latn', 'arab'];

    /**
     * ICU locale per supported language. `ar_BH` rather than bare `ar`: the
     * installation's business is Bahraini, and the region decides details such
     * as the decimal and grouping separators.
     */
    private const ICU = ['en' => 'en_GB', 'ar' => 'ar_BH'];

    private string $locale = 'en';

    private string $numerals = 'latn';

    public function use(string $locale, string $numerals): void
    {
        $this->locale = in_array($locale, self::LOCALES, true) ? $locale : 'en';
        $this->numerals = in_array($numerals, self::NUMERALS, true) ? $numerals : 'latn';

        app()->setLocale($this->locale);
    }

    public function locale(): string
    {
        return $this->locale;
    }

    public function numerals(): string
    {
        return $this->numerals;
    }

    public function isRtl(): bool
    {
        return $this->locale === 'ar';
    }

    public function number(int|float|string $value, int $decimals = 0): string
    {
        $formatter = $this->formatter(NumberFormatter::DECIMAL);
        $formatter->setAttribute(NumberFormatter::MIN_FRACTION_DIGITS, $decimals);
        $formatter->setAttribute(NumberFormatter::MAX_FRACTION_DIGITS, $decimals);

        return $this->clean((string) $formatter->format((float) $value));
    }

    /**
     * A ratio as a percentage: 0.224 → "22.4%" or "٢٢٫٤٪".
     *
     * Always the ABSOLUTE value. Every sentence that quotes a percentage states
     * its direction in words ("fell", "rose"), and a sign on top of the verb
     * would say it twice — or, for a fall, contradict it.
     */
    public function percent(float $ratio, int $decimals = 1): string
    {
        $formatter = $this->formatter(NumberFormatter::PERCENT);
        $formatter->setAttribute(NumberFormatter::MIN_FRACTION_DIGITS, $decimals);
        $formatter->setAttribute(NumberFormatter::MAX_FRACTION_DIGITS, $decimals);

        return $this->clean((string) $formatter->format(abs($ratio)));
    }

    /** Percentage points: 0.042 → "4.2", for sentences that say "points" in words. */
    public function points(float $delta, int $decimals = 1): string
    {
        return $this->number(abs($delta) * 100, $decimals);
    }

    private function formatter(int $style): NumberFormatter
    {
        return new NumberFormatter(self::ICU[$this->locale].'@numbers='.$this->numerals, $style);
    }

    /**
     * ICU wraps some output in bidi control marks (U+200E, U+200F, U+061C).
     *
     * Inside a JSON string travelling to a browser they are invisible, they
     * break equality in tests, and the client isolates figures itself where
     * direction matters. The digits and separators are what carry meaning.
     */
    private function clean(string $formatted): string
    {
        return str_replace(["\u{200E}", "\u{200F}", "\u{061C}"], '', $formatted);
    }
}
