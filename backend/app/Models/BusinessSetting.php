<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * Singleton configuration row.
 *
 * @property int $id
 * @property string $company_name
 * @property string $currency
 * @property int $currency_decimals
 * @property string $timezone
 * @property int $fiscal_year_start_month
 * @property int $default_low_stock_threshold
 */
class BusinessSetting extends Model
{
    public const SINGLETON_ID = 1;

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

    /**
     * Resolved once per request. Every metric period boundary depends on
     * `timezone`, so this is read on effectively every analytics request.
     */
    public static function current(): self
    {
        return once(static fn (): self => self::findOrFail(self::SINGLETON_ID));
    }
}
