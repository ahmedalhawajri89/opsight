<?php

declare(strict_types=1);

use App\Domain\Tax\VatCalculation;

/*
|--------------------------------------------------------------------------
| VatCalculation — one order's VAT, from shelf amounts (ADR-018)
|--------------------------------------------------------------------------
|
| The identity every case is held to: subtotal − net discount + VAT is what
| the customer pays for the goods. That is the shelf total less the discount
| when prices include VAT, or that plus VAT when they do not.
|
*/

function vatFor(array $lines, string $discount = '0', bool $inclusive = true, int $scale = 3): array
{
    return VatCalculation::calculate(
        array_map(fn (array $line): array => ['shelf' => $line[0], 'rate' => $line[1]], $lines),
        $discount,
        $inclusive,
        $scale,
    );
}

it('takes the VAT out of a price that includes it', function (): void {
    $vat = vatFor([['110.000', '10']]);

    expect($vat['lines'][0])->toBe(['net' => '100.000', 'taxable' => '100.000', 'vat' => '10.000', 'rate' => '10'])
        ->and($vat['vat_total'])->toBe('10.000')
        ->and($vat['discount_net'])->toBe('0.000');
});

it('adds VAT on top of a price that excludes it', function (): void {
    $vat = vatFor([['100.000', '15']], inclusive: false);

    expect($vat['lines'][0]['net'])->toBe('100.000')
        ->and($vat['lines'][0]['vat'])->toBe('15.000');
});

it('charges nothing on a zero-rated line', function (): void {
    $vat = vatFor([['50.000', '0']]);

    expect($vat['lines'][0]['net'])->toBe('50.000')
        ->and($vat['lines'][0]['vat'])->toBe('0.000');
});

it('reduces the VAT base by an order discount, shared across rates', function (): void {
    // 110 at 10% and 50 zero-rated, with 16 off the order: shares 11 and 5.
    $vat = vatFor([['110.000', '10'], ['50.000', '0']], discount: '16.000');

    expect($vat['lines'][0])->toMatchArray(['net' => '100.000', 'taxable' => '90.000', 'vat' => '9.000'])
        ->and($vat['lines'][1])->toMatchArray(['net' => '50.000', 'taxable' => '45.000', 'vat' => '0.000'])
        ->and($vat['discount_net'])->toBe('15.000')
        ->and($vat['vat_total'])->toBe('9.000');
});

it('places the rounding remainder so the shares sum to the discount exactly', function (): void {
    // Three equal lines, 10 off: 3.33 × 3 = 9.99, so one line carries 3.34.
    $vat = vatFor([['10.00', '0'], ['10.00', '0'], ['10.00', '0']], discount: '10.00', scale: 2);

    $taxable = array_map(fn (array $line): string => $line['taxable'], $vat['lines']);

    expect($taxable)->toBe(['6.66', '6.67', '6.67'])
        ->and($vat['discount_net'])->toBe('10.00');
});

it('never turns VAT negative when the discount exceeds the goods', function (): void {
    $vat = vatFor([['11.000', '10']], discount: '50.000');

    expect($vat['lines'][0]['vat'])->toBe('0.000')
        ->and($vat['lines'][0]['taxable'])->toBe('0.000');
});

it('keeps the customer total identity', function (array $lines, string $discount, bool $inclusive): void {
    $vat = vatFor($lines, $discount, $inclusive);

    $shelf = array_reduce($lines, fn (string $sum, array $line): string => bcadd($sum, $line[0], 3), '0');
    $subtotal = array_reduce($vat['lines'], fn (string $sum, array $line): string => bcadd($sum, $line['net'], 3), '0');
    $paid = bcadd(bcsub($subtotal, $vat['discount_net'], 3), $vat['vat_total'], 3);

    $expected = $inclusive
        ? bcsub($shelf, $discount, 3)
        : bcadd(bcsub($shelf, $discount, 3), $vat['vat_total'], 3);

    expect($paid)->toBe($expected);
})->with([
    'inclusive, mixed rates, awkward amounts' => [[['12.345', '10'], ['7.777', '15'], ['3.333', '5']], '1.111', true],
    'inclusive, one line, no discount' => [[['0.999', '10']], '0', true],
    'exclusive, mixed rates, discount' => [[['12.345', '10'], ['7.777', '15']], '2.500', false],
    'exclusive, zero-rated only' => [[['40.000', '0'], ['2.000', '0']], '1.000', false],
]);
