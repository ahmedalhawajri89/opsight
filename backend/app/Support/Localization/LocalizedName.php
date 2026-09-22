<?php

declare(strict_types=1);

namespace App\Support\Localization;

/**
 * Which of a record's names the current reader sees (ADR-021).
 *
 * An Arabic reader gets `name_ar` when there is one; everyone else, and an
 * Arabic reader of a record with no Arabic name, gets `name`. The rule lives
 * here once, in a PHP form for resources and a SQL form for the aggregates
 * that select names directly, so a product cannot be called one thing in a
 * table and another in the chart beside it.
 *
 * The reader's language is the application locale, which SetLocale has
 * already set from the account (or Accept-Language before sign-in).
 */
final class LocalizedName
{
    public static function pick(?string $name, ?string $nameAr): ?string
    {
        if (self::arabic() && $nameAr !== null && trim($nameAr) !== '') {
            return $nameAr;
        }

        return $name;
    }

    /**
     * The same choice as a SQL expression over two columns.
     *
     * Column names come from code, never from a request, so they are written
     * into the expression directly.
     */
    public static function sql(string $nameColumn, string $arabicColumn): string
    {
        return self::arabic()
            ? "COALESCE(NULLIF(TRIM({$arabicColumn}), ''), {$nameColumn})"
            : $nameColumn;
    }

    private static function arabic(): bool
    {
        return app()->getLocale() === 'ar';
    }
}
