<?php

declare(strict_types=1);

use App\Support\Money;

/*
|--------------------------------------------------------------------------
| Money::round — the one rounding rule for every amount
|--------------------------------------------------------------------------
|
| Half-up, away from zero, to the currency's own places, on strings. The
| scale is passed explicitly here so the rule is tested apart from the
| settings row that normally supplies it.
|
*/

it('rounds half-up to the given places', function (string $value, int $scale, string $expected): void {
    expect(Money::round($value, $scale))->toBe($expected);
})->with([
    'three places keeps the third decimal' => ['1.255', 3, '1.255'],
    'three places, half rounds up' => ['1.2555', 3, '1.256'],
    'three places, below half rounds down' => ['1.2554', 3, '1.255'],
    'two places, half rounds up' => ['1.255', 2, '1.26'],
    'two places, below half rounds down' => ['1.254', 2, '1.25'],
    'zero places, for a currency with no minor unit' => ['12.5', 0, '13'],
    'negative, half rounds away from zero' => ['-1.255', 2, '-1.26'],
    'an exact value is unchanged' => ['540', 3, '540.000'],
]);

it('writes zero at the currency places', function (): void {
    expect(Money::round('0', 3))->toBe('0.000')
        ->and(Money::round('0', 2))->toBe('0.00');
});
