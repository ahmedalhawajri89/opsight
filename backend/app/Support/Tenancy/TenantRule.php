<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use Illuminate\Validation\Rule;
use Illuminate\Validation\Rules\Exists;
use Illuminate\Validation\Rules\Unique;

/**
 * Validation rules that look only inside the business in context (ADR-023).
 *
 * `exists:customers,id` asks the whole table, so another business's customer
 * id would pass validation and be written onto this business's order. And a
 * SKU is unique per business, not across every business on the server.
 */
final class TenantRule
{
    public static function exists(string $table, string $column = 'id'): Exists
    {
        return Rule::exists($table, $column)->where('business_id', CurrentBusiness::get()->id());
    }

    public static function unique(string $table, string $column): Unique
    {
        return Rule::unique($table, $column)->where('business_id', CurrentBusiness::get()->id());
    }
}
