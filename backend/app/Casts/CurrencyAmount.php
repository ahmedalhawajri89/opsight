<?php

declare(strict_types=1);

namespace App\Casts;

use App\Support\Money;
use Illuminate\Contracts\Database\Eloquent\CastsAttributes;
use Illuminate\Database\Eloquent\Model;

/**
 * A money TOTAL, held at the business currency's own decimal places.
 *
 * Replaces the fixed `decimal:2` cast, which formatted every total to two
 * places whatever the currency. Written values are rounded half-up to the
 * currency's places before they reach the column; read values come back as a
 * string at exactly those places — "540.50" for SAR, "540.500" for BHD — so the
 * API, CSV exports and every calculation see the same figure.
 *
 * Unit amounts (price, cost, unit_price, unit_cost) are not this cast: they
 * keep four places, because a unit price may legitimately be finer than the
 * currency, and only the line it produces is rounded.
 *
 * @implements CastsAttributes<string|null, string|int|float|null>
 */
final class CurrencyAmount implements CastsAttributes
{
    /**
     * @param  array<string, mixed>  $attributes
     */
    public function get(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return $value === null ? null : Money::round((string) $value);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    public function set(Model $model, string $key, mixed $value, array $attributes): ?string
    {
        return $value === null ? null : Money::round((string) $value);
    }
}
