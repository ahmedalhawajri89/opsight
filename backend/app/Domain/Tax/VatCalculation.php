<?php

declare(strict_types=1);

namespace App\Domain\Tax;

use App\Support\Money;

/**
 * VAT for one order, from its lines' shelf amounts (ADR-018).
 *
 * A pure function of its inputs: no model, no database, no settings lookup
 * beyond the currency scale passed in. ConfirmOrder feeds it and writes what
 * it returns.
 *
 * INPUT. Each line's SHELF amount — price × quantity − line discount, rounded
 * at the line, in the same basis the prices are written in — and the line's
 * rate as a percentage. Plus the order-level discount, also in that basis.
 *
 * OUTPUT. For each line: its net amount (excluding VAT) BEFORE the order
 * discount, which becomes `line_total` and so feeds every revenue figure; the
 * net amount AFTER its share of the discount, which is what VAT is charged on;
 * and the VAT itself. For the order: the net discount, and the VAT total.
 *
 * The identity the tests hold it to: subtotal − net discount + VAT is exactly
 * what the customer pays for the goods — the shelf total less the discount
 * when prices include VAT, or that plus VAT when they do not.
 *
 * WHY THE DISCOUNT IS SPREAD ACROSS LINES. A discount given at the time of
 * sale reduces the value VAT is charged on. With lines at different rates it
 * has to be apportioned to know how much each rate's base shrinks, so it is
 * shared in proportion to each line's shelf amount, and any rounding remainder
 * is placed on the largest line so the shares sum to the discount exactly. A
 * line's share never exceeds the line: a discount larger than the goods cannot
 * turn VAT negative.
 */
final class VatCalculation
{
    /**
     * @param  list<array{shelf: string, rate: string}>  $lines
     * @return array{
     *     lines: list<array{net: string, taxable: string, vat: string, rate: string}>,
     *     discount_net: string,
     *     vat_total: string,
     * }
     */
    public static function calculate(array $lines, string $discount, bool $pricesIncludeVat, int $scale): array
    {
        $shares = self::shareDiscount(array_column($lines, 'shelf'), $discount, $scale);

        $result = [];
        $netBefore = '0';
        $netAfter = '0';
        $vatTotal = '0';

        foreach ($lines as $index => $line) {
            $rate = $line['rate'];
            $shelf = $line['shelf'];
            $base = bcsub($shelf, $shares[$index], $scale);

            if ($pricesIncludeVat) {
                $factor = bcadd('1', bcdiv($rate, '100', 10), 10);
                $net = Money::round(bcdiv($shelf, $factor, 10), $scale);
                $taxable = Money::round(bcdiv($base, $factor, 10), $scale);
                // Whatever of the shelf amount is not net IS the VAT: the line
                // then adds back to exactly what the customer was charged.
                $vat = bcsub($base, $taxable, $scale);
            } else {
                $net = $shelf;
                $taxable = $base;
                $vat = Money::round(bcmul($base, bcdiv($rate, '100', 10), 10), $scale);
            }

            $result[] = ['net' => $net, 'taxable' => $taxable, 'vat' => $vat, 'rate' => $rate];
            $netBefore = bcadd($netBefore, $net, $scale);
            $netAfter = bcadd($netAfter, $taxable, $scale);
            $vatTotal = bcadd($vatTotal, $vat, $scale);
        }

        return [
            'lines' => $result,
            'discount_net' => bcsub($netBefore, $netAfter, $scale),
            'vat_total' => $vatTotal,
        ];
    }

    /**
     * The order discount, apportioned by shelf amount, remainder on the
     * largest line, each share capped at its line.
     *
     * @param  list<string>  $shelves
     * @return list<string>
     */
    private static function shareDiscount(array $shelves, string $discount, int $scale): array
    {
        $zero = Money::round('0', $scale);
        $shares = array_fill(0, count($shelves), $zero);
        $total = array_reduce($shelves, fn (string $sum, string $shelf): string => bcadd($sum, $shelf, $scale), '0');

        if (bccomp($discount, '0', $scale) <= 0 || bccomp($total, '0', $scale) <= 0) {
            return $shares;
        }

        // Never more than there is to discount.
        $discount = bccomp($discount, $total, $scale) > 0 ? $total : $discount;

        $allocated = '0';
        $largest = 0;

        foreach ($shelves as $index => $shelf) {
            $shares[$index] = Money::round(bcdiv(bcmul($discount, $shelf, 10), $total, 10), $scale);
            $allocated = bcadd($allocated, $shares[$index], $scale);

            if (bccomp($shelf, $shelves[$largest], $scale) > 0) {
                $largest = $index;
            }
        }

        $shares[$largest] = bcadd($shares[$largest], bcsub($discount, $allocated, $scale), $scale);

        return $shares;
    }
}
