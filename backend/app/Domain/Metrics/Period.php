<?php

declare(strict_types=1);

namespace App\Domain\Metrics;

use App\Domain\Calendar\HijriCalendar;
use App\Models\BusinessSetting;
use Illuminate\Support\Carbon;
use InvalidArgumentException;

/**
 * A reporting period.
 *
 * THE RULE THIS CLASS EXISTS TO ENFORCE (METRICS.md §1.2):
 *
 *   1. The user picks calendar DATES.
 *   2. Boundaries are resolved in the BUSINESS timezone.
 *   3. They are converted to UTC for querying.
 *   4. The range is HALF-OPEN: >= from, < toExclusive.
 *
 * Never the reverse. Resolving a boundary in UTC and then displaying it in the
 * business timezone silently moves orders between periods at every month end,
 * and the resulting figures look entirely plausible.
 *
 * Half-open matters as much: `<= 23:59:59` drops any row in the final second,
 * which is rare enough to survive review and frequent enough to be wrong.
 */
final readonly class Period
{
    private function __construct(
        public string $from,           // yyyy-mm-dd, business-local
        public string $to,             // yyyy-mm-dd, business-local, INCLUSIVE
        public string $timezone,
        public Carbon $fromUtc,
        public Carbon $toExclusiveUtc,
        public ?string $preset = null,
    ) {}

    public static function between(string $from, string $to, ?string $timezone = null): self
    {
        $timezone ??= BusinessSetting::current()->timezone;

        if ($from > $to) {
            throw new InvalidArgumentException('A period cannot end before it starts.');
        }

        // Midnight at the start of `from`, in the business timezone.
        $fromLocal = Carbon::parse($from, $timezone)->startOfDay();

        // Midnight at the start of the day AFTER `to`. The comparison is `<`,
        // so the whole of `to` is included and nothing is dropped.
        $toExclusiveLocal = Carbon::parse($to, $timezone)->startOfDay()->addDay();

        return new self(
            from: $from,
            to: $to,
            timezone: $timezone,
            fromUtc: $fromLocal->clone()->utc(),
            toExclusiveUtc: $toExclusiveLocal->clone()->utc(),
        );
    }

    /**
     * Resolve a named preset.
     *
     * `qtd` and `ytd` respect business_settings.fiscal_year_start_month, so a
     * business whose year begins in July is not shown a calendar-year YTD.
     */
    public static function preset(string $preset, ?Carbon $today = null): self
    {
        $settings = BusinessSetting::current();
        $timezone = $settings->timezone;
        $today ??= Carbon::now($timezone);
        $today = $today->clone()->setTimezone($timezone)->startOfDay();

        // Rolling presets include today: "last 7 days" is today plus the six
        // before it, which is what an operator means by it.
        $from = match ($preset) {
            '7d' => $today->clone()->subDays(6),
            '30d' => $today->clone()->subDays(29),
            '90d' => $today->clone()->subDays(89),
            '365d' => $today->clone()->subDays(364),
            'mtd' => $today->clone()->startOfMonth(),
            'qtd' => self::fiscalQuarterStart($today, $settings->fiscal_year_start_month),
            'ytd' => self::fiscalYearStart($today, $settings->fiscal_year_start_month),
            default => throw new InvalidArgumentException("Unknown period preset: {$preset}."),
        };

        $period = self::between($from->toDateString(), $today->toDateString(), $timezone);

        return new self(
            from: $period->from,
            to: $period->to,
            timezone: $period->timezone,
            fromUtc: $period->fromUtc,
            toExclusiveUtc: $period->toExclusiveUtc,
            preset: $preset,
        );
    }

    /**
     * The last `$days` days ending today, inclusive.
     *
     * A configurable sibling of the rolling presets, for windows a user never
     * picks but a rule needs — the trailing sales rate behind stock coverage,
     * for instance. It resolves through the same business timezone as every
     * other period, so a "last 30 days" computed here and one computed from a
     * preset cannot land on different boundaries.
     */
    public static function trailingDays(int $days, ?Carbon $today = null): self
    {
        $timezone = BusinessSetting::current()->timezone;
        $today ??= Carbon::now($timezone);
        $today = $today->clone()->setTimezone($timezone)->startOfDay();

        return self::between(
            $today->clone()->subDays(max($days, 1) - 1)->toDateString(),
            $today->toDateString(),
            $timezone,
        );
    }

    public static function fiscalYearStart(Carbon $date, int $fiscalStartMonth): Carbon
    {
        $year = $date->month >= $fiscalStartMonth ? $date->year : $date->year - 1;

        return $date->clone()->setDate($year, $fiscalStartMonth, 1)->startOfDay();
    }

    /** Quarters are counted from the fiscal year start, not from January. */
    public static function fiscalQuarterStart(Carbon $date, int $fiscalStartMonth): Carbon
    {
        $yearStart = self::fiscalYearStart($date, $fiscalStartMonth);
        $monthsElapsed = ($date->year - $yearStart->year) * 12 + ($date->month - $yearStart->month);
        $quarterIndex = intdiv($monthsElapsed, 3);

        return $yearStart->clone()->addMonths($quarterIndex * 3)->startOfDay();
    }

    /** Inclusive, so a single-day period has a length of 1. */
    public function lengthInDays(): int
    {
        // diffInDays returns a float in Carbon 3; a period length is whole days.
        return (int) Carbon::parse($this->from)->diffInDays(Carbon::parse($this->to)) + 1;
    }

    /**
     * True when the period reaches today or beyond — it is still accumulating.
     *
     * Every response carries this so the UI can badge the figure "Incomplete"
     * rather than let a half-finished month read as a finished one.
     */
    public function isPartial(?Carbon $today = null): bool
    {
        $today ??= Carbon::now($this->timezone);

        return $this->to >= $today->clone()->setTimezone($this->timezone)->toDateString();
    }

    /**
     * The comparison period.
     *
     * `previous_period` is the equal-length range ending the day before this
     * one — the default, because "is this better than recently?" is the
     * question an operator actually asks. `previous_year` shifts by one
     * calendar year, which seasonal businesses need.
     */
    public function comparison(string $basis): ?self
    {
        if ($basis === Comparison::None->value) {
            return null;
        }

        /*
         * The same Hijri dates one Hijri year earlier — about 354 days, not
         * 365 — so a period holding Ramadan is compared with last Ramadan
         * rather than with whatever trade those Gregorian dates held.
         */
        if ($basis === Comparison::PreviousHijriYear->value) {
            return self::between(
                HijriCalendar::shiftYears($this->from, -1),
                HijriCalendar::shiftYears($this->to, -1),
                $this->timezone,
            );
        }

        if ($basis === Comparison::PreviousYear->value) {
            return self::between(
                Carbon::parse($this->from)->subYear()->toDateString(),
                Carbon::parse($this->to)->subYear()->toDateString(),
                $this->timezone,
            );
        }

        $length = $this->lengthInDays();
        $previousTo = Carbon::parse($this->from)->subDay();
        $previousFrom = $previousTo->clone()->subDays($length - 1);

        return self::between(
            $previousFrom->toDateString(),
            $previousTo->toDateString(),
            $this->timezone,
        );
    }

    /**
     * The UTC bounds a query ranges on.
     *
     * @return array{0: string, 1: string}
     */
    public function utcBounds(): array
    {
        return [
            $this->fromUtc->toDateTimeString(),
            $this->toExclusiveUtc->toDateTimeString(),
        ];
    }

    /** @return array<string, mixed> */
    public function toArray(): array
    {
        return [
            'from' => $this->from,
            'to' => $this->to,
            'timezone' => $this->timezone,
            'preset' => $this->preset,
            'days' => $this->lengthInDays(),
            'is_partial' => $this->isPartial(),
        ];
    }
}
