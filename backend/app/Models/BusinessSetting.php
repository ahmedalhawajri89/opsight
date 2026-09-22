<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Audit\RecordsActivity;
use App\Observers\AuditObserver;
use App\Support\Tenancy\CurrentBusiness;
use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One business's configuration: one row per business (ADR-023).
 *
 * `timezone` matters more than it looks: every metric period boundary is
 * resolved in it before being converted to UTC for querying, so it is read on
 * effectively every analytics request (METRICS.md §1.2).
 *
 * @property int $id
 * @property string $company_name
 * @property string $currency
 * @property int $currency_decimals
 * @property string $timezone
 * @property int $fiscal_year_start_month
 * @property int $default_low_stock_threshold
 * @property bool $vat_enabled
 * @property string $vat_rate
 * @property bool $prices_include_vat
 * @property string|null $vat_number
 * @property string|null $commercial_registration
 * @property int $week_starts_on
 * @property list<int>|null $weekend_days
 * @property Carbon|null $created_at
 */
#[ObservedBy(AuditObserver::class)]
class BusinessSetting extends Model
{
    use RecordsActivity;
    use ScopedToBusiness;

    public function auditSubject(): string
    {
        return 'settings';
    }

    /**
     * Memoised for the request, per business.
     *
     * Deliberately NOT `once()`: in a web request that is per-request and fine,
     * but in a test process it is effectively global, so changing the timezone
     * or fiscal year in one test would leave every later test reading the old
     * value — and a timezone bug is exactly what these tests exist to catch.
     * An explicit cache with an explicit flush is honest about its lifetime.
     */
    /** @var array<int, self> */
    private static array $cached = [];

    /** @var list<string> */
    protected $fillable = [
        'company_name',
        'currency',
        'currency_decimals',
        'timezone',
        'fiscal_year_start_month',
        'default_low_stock_threshold',
        'vat_enabled',
        'vat_rate',
        'prices_include_vat',
        'vat_number',
        'commercial_registration',
        'week_starts_on',
        'weekend_days',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'currency_decimals' => 'integer',
            'fiscal_year_start_month' => 'integer',
            'default_low_stock_threshold' => 'integer',
            'vat_enabled' => 'boolean',
            'vat_rate' => 'decimal:2',
            'prices_include_vat' => 'boolean',
            'week_starts_on' => 'integer',
            'weekend_days' => 'array',
        ];
    }

    /**
     * The Carbon day constant the business week starts on.
     *
     * Stored ISO-numbered (1 = Monday … 7 = Sunday); Carbon numbers Sunday 0.
     */
    public function weekStartCarbonDay(): int
    {
        return ((int) $this->week_starts_on) % 7;
    }

    /** The Carbon day constant the business week ends on: the day before it starts. */
    public function weekEndCarbonDay(): int
    {
        return ($this->weekStartCarbonDay() + 6) % 7;
    }

    /** The settings of the business in context. */
    public static function current(): self
    {
        $business = CurrentBusiness::get()->id();

        return self::$cached[$business] ??= self::query()->firstOrFail();
    }

    /**
     * Create the settings of the business in context if they are missing, and
     * return them.
     *
     * @param  array<string, mixed>  $attributes
     */
    public static function ensureExists(array $attributes = []): self
    {
        $existing = self::query()->first();

        if ($existing !== null) {
            return $existing;
        }

        self::flushCache();

        return self::create(array_merge([
            'company_name' => 'Opsight',
            'currency' => 'BHD',
            'currency_decimals' => 3,
            'timezone' => 'Asia/Bahrain',
            'fiscal_year_start_month' => 1,
            'default_low_stock_threshold' => 10,
            'weekend_days' => [5, 6],
        ], $attributes));
    }

    /** Called after any settings change, and between tests. */
    public static function flushCache(): void
    {
        self::$cached = [];
    }

    protected static function booted(): void
    {
        // A saved change must not be invisible to the rest of the request.
        static::saved(static fn () => self::flushCache());
    }
}
