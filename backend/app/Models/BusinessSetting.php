<?php

declare(strict_types=1);

namespace App\Models;

use App\Domain\Audit\RecordsActivity;
use App\Observers\AuditObserver;
use Illuminate\Database\Eloquent\Attributes\ObservedBy;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * Singleton configuration row.
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
 * @property Carbon|null $created_at
 */
#[ObservedBy(AuditObserver::class)]
class BusinessSetting extends Model
{
    use RecordsActivity;

    public function auditSubject(): string
    {
        return 'settings';
    }

    public const SINGLETON_ID = 1;

    /**
     * Memoised for the request.
     *
     * Deliberately NOT `once()`: in a web request that is per-request and fine,
     * but in a test process it is effectively global, so changing the timezone
     * or fiscal year in one test would leave every later test reading the old
     * value — and a timezone bug is exactly what these tests exist to catch.
     * An explicit cache with an explicit flush is honest about its lifetime.
     */
    private static ?self $cached = null;

    /** @var list<string> */
    protected $fillable = [
        'company_name',
        'currency',
        'currency_decimals',
        'timezone',
        'fiscal_year_start_month',
        'default_low_stock_threshold',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'currency_decimals' => 'integer',
            'fiscal_year_start_month' => 'integer',
            'default_low_stock_threshold' => 'integer',
        ];
    }

    public static function current(): self
    {
        return self::$cached ??= self::findOrFail(self::SINGLETON_ID);
    }

    /**
     * Create the singleton if it is missing, and return it.
     *
     * `id` is deliberately not fillable — it is a fixed 1 enforced by a CHECK
     * constraint — so the row is force-created rather than widening $fillable
     * and letting a request payload reach it.
     *
     * @param  array<string, mixed>  $attributes
     */
    public static function ensureExists(array $attributes = []): self
    {
        $existing = self::find(self::SINGLETON_ID);

        if ($existing !== null) {
            return $existing;
        }

        self::flushCache();

        return self::forceCreate(array_merge([
            'id' => self::SINGLETON_ID,
            'company_name' => 'Opsight',
            'currency' => 'BHD',
            'currency_decimals' => 3,
            'timezone' => 'Asia/Bahrain',
            'fiscal_year_start_month' => 1,
            'default_low_stock_threshold' => 10,
        ], $attributes));
    }

    /** Called after any settings change, and between tests. */
    public static function flushCache(): void
    {
        self::$cached = null;
    }

    protected static function booted(): void
    {
        // A saved change must not be invisible to the rest of the request.
        static::saved(static fn () => self::flushCache());
    }
}
