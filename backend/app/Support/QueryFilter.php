<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Allowlisted filtering, sorting and pagination.
 *
 * Two rules, both deliberate:
 *
 * 1. **An unknown filter or sort key is a 422, not a silent ignore.** Ignoring
 *    it hides bugs from the developer and probing from the log, and leaves the
 *    caller believing a filter applied when it did not (ARCHITECTURE.md §4).
 *
 * 2. **Column names never come from user input.** A sort parameter maps through
 *    a fixed array to a column; it is never interpolated. Every value is bound.
 *
 * Typing note: builders are annotated `Builder<covariant Model>` rather than
 * with a class-level template. This utility is genuinely model-agnostic — it
 * only ever calls `where`, `orderBy` and friends — and a template cannot be
 * inferred through a callable-typed constructor argument anyway. Covariance
 * states exactly what is true: any Builder will do.
 */
final class QueryFilter
{
    private const MAX_PER_PAGE = 100;

    private const DEFAULT_PER_PAGE = 25;

    /**
     * @param  array<string, callable(Builder<covariant Model>, string): mixed>  $filters
     * @param  array<int, string>  $sortable
     */
    public function __construct(
        private readonly array $filters,
        private readonly array $sortable,
        private readonly string $defaultSort = '-created_at',
    ) {}

    /**
     * @param  Builder<covariant Model>  $query
     * @return Builder<covariant Model>
     */
    public function apply(Builder $query, Request $request): Builder
    {
        $this->applyFilters($query, $request);
        $this->applySort($query, $request);

        return $query;
    }

    /**
     * @param  Builder<covariant Model>  $query
     */
    private function applyFilters(Builder $query, Request $request): void
    {
        $requested = $request->query('filter', []);

        if (! is_array($requested)) {
            throw ValidationException::withMessages([
                'filter' => 'Filters must be supplied as filter[key]=value.',
            ]);
        }

        $unknown = array_diff(array_keys($requested), array_keys($this->filters));

        if ($unknown !== []) {
            throw ValidationException::withMessages([
                'filter' => 'Unknown filter: '.implode(', ', $unknown)
                    .'. Allowed: '.implode(', ', array_keys($this->filters)).'.',
            ]);
        }

        foreach ($requested as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }

            ($this->filters[$key])($query, (string) $value);
        }
    }

    /**
     * @param  Builder<covariant Model>  $query
     */
    private function applySort(Builder $query, Request $request): void
    {
        $sort = (string) $request->query('sort', $this->defaultSort);

        $descending = str_starts_with($sort, '-');
        $field = $descending ? substr($sort, 1) : $sort;

        if (! in_array($field, $this->sortable, strict: true)) {
            throw ValidationException::withMessages([
                'sort' => "Cannot sort by '{$field}'. Allowed: "
                    .implode(', ', $this->sortable).'.',
            ]);
        }

        $query->orderBy($field, $descending ? 'desc' : 'asc');
    }

    public static function perPage(Request $request): int
    {
        $perPage = (int) $request->query('per_page', (string) self::DEFAULT_PER_PAGE);

        if ($perPage < 1) {
            return self::DEFAULT_PER_PAGE;
        }

        // Capped rather than rejected: a caller asking for 5,000 rows wants as
        // many as they can have, not an error.
        return min($perPage, self::MAX_PER_PAGE);
    }

    /**
     * A LIKE search across a fixed set of columns.
     *
     * `%` and `_` are escaped, so a search for "%" is a literal search for a
     * percent sign rather than a full-table scan (SECURITY.md §8).
     *
     * @param  array<int, string>  $columns
     * @return callable(Builder<covariant Model>, string): mixed
     */
    public static function search(array $columns): callable
    {
        return function (Builder $query, string $term) use ($columns): Builder {
            $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\%', '\_'], $term);

            return $query->where(function (Builder $inner) use ($columns, $escaped): void {
                foreach ($columns as $column) {
                    $inner->orWhere($column, 'like', "%{$escaped}%");
                }
            });
        };
    }

    /**
     * An exact match, or a comma-separated set.
     *
     * @return callable(Builder<covariant Model>, string): mixed
     */
    public static function exact(string $column): callable
    {
        return function (Builder $query, string $value) use ($column): Builder {
            $values = array_filter(array_map('trim', explode(',', $value)), fn ($v): bool => $v !== '');

            return count($values) > 1
                ? $query->whereIn($column, $values)
                : $query->where($column, $value);
        };
    }

    /** @return callable(Builder<covariant Model>, string): mixed */
    public static function boolean(string $column): callable
    {
        return fn (Builder $query, string $value): Builder => $query->where(
            $column,
            filter_var($value, FILTER_VALIDATE_BOOLEAN),
        );
    }

    /** @return callable(Builder<covariant Model>, string): mixed */
    public static function dateFrom(string $column): callable
    {
        return fn (Builder $query, string $value): Builder => $query->whereDate($column, '>=', $value);
    }

    /** @return callable(Builder<covariant Model>, string): mixed */
    public static function dateTo(string $column): callable
    {
        return fn (Builder $query, string $value): Builder => $query->whereDate($column, '<=', $value);
    }
}
