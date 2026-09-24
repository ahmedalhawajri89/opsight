<?php

declare(strict_types=1);

namespace App\Domain\Businesses;

use App\Models\ExpenseCategory;

/**
 * The expense categories every business starts with (ADR-024).
 *
 * A business cannot record a cost until it has at least one category, and a
 * business with no costs has no net profit — so an empty list is not a blank
 * slate, it is a screen the owner cannot use. Named in the language of
 * whoever the business was created for; renaming them is ordinary editing.
 */
final class DefaultExpenseCategories
{
    /** @var list<string> Keys into labels.default_expense_categories. */
    public const KEYS = ['rent', 'salaries', 'utilities', 'marketing', 'shipping', 'supplies', 'other'];

    /** Creates any that are missing for the business in context. */
    public static function seed(string $locale = 'en'): void
    {
        foreach (self::KEYS as $key) {
            ExpenseCategory::query()->firstOrCreate(
                ['slug' => $key],
                ['name' => trans("labels.default_expense_categories.{$key}", [], $locale)],
            );
        }
    }
}
