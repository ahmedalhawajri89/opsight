<?php

declare(strict_types=1);

namespace App\Support\Tenancy;

use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * A query-builder query on a business-owned table, already inside the
 * business in context (ADR-023).
 *
 * The metric, tax and inventory aggregates are written against the query
 * builder for speed, and the query builder knows nothing of Eloquent's global
 * scopes. Every one of them starts here instead of at DB::table(), so the
 * business filter cannot be forgotten; TenantIsolationTest fails if a raw
 * DB::table() appears in app/ again.
 *
 * Joined tables are reached through foreign keys from the filtered table, so
 * they belong to the same business by construction and are not filtered twice.
 */
final class TenantQuery
{
    public static function table(string $table, ?string $alias = null): Builder
    {
        $name = $alias ?? $table;

        return DB::table($alias === null ? $table : "{$table} as {$alias}")
            ->where("{$name}.business_id", CurrentBusiness::get()->id());
    }
}
