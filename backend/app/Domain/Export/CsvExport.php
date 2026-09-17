<?php

declare(strict_types=1);

namespace App\Domain\Export;

use App\Domain\Audit\AuditRecorder;
use App\Support\Localization\Localizer;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Arr;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Streams a filtered query to CSV, through the screen's own resource class.
 *
 * THE RESOURCE IS THE POINT. An export is not a second query path that happens
 * to produce the same data; it serialises each row with exactly the class the
 * screen uses, so field-level redaction is INHERITED rather than reimplemented.
 * A cost-blind role's ProductResource omits `cost`, so the exporter never sees
 * the key, so the column is not written. There is no second place to remember
 * the rule, which is the only way a rule survives (SECURITY.md §9.2).
 *
 * Columns are declared as `path => header` by the calling controller. The path
 * is read out of the SERIALISED row, never off the model — reading the model
 * directly would walk straight around the redaction this class depends on.
 */
final class CsvExport
{
    /**
     * Fallbacks, used only if config/export.php is missing. The live values
     * are configuration — see that file for why, and for the reasoning behind
     * refusing rather than truncating.
     */
    public const DEFAULT_MAX_ROWS = 50_000;

    private const DEFAULT_CHUNK = 500;

    public function __construct(private readonly AuditRecorder $recorder) {}

    public function maxRows(): int
    {
        return (int) config('export.max_rows', self::DEFAULT_MAX_ROWS);
    }

    private function chunkSize(): int
    {
        return (int) config('export.chunk', self::DEFAULT_CHUNK);
    }

    /**
     * @param  Builder<covariant Model>  $query
     * @param  class-string<JsonResource>  $resource
     * @param  array<string, string>  $columns  serialised path => CSV header
     */
    public function stream(
        Builder $query,
        string $resource,
        array $columns,
        Request $request,
        string $filename,
    ): StreamedResponse {
        $total = (clone $query)->toBase()->getCountForPagination();
        $max = $this->maxRows();

        if ($total > $max) {
            throw ValidationException::withMessages([
                'filter' => __('errors.export.too_many_rows', [
                    'rows' => app(Localizer::class)->number($total),
                    'limit' => app(Localizer::class)->number($max),
                ]),
            ]);
        }

        /*
         * Audited BEFORE the stream, not after.
         *
         * The body is produced after the framework has already returned, so a
         * client that disconnects mid-download never reaches code placed at the
         * end. The auditable fact is that the data was RELEASED, which is true
         * the moment the request is authorised — whether or not the file
         * finished arriving.
         */
        $this->recorder->record(
            action: 'export.generated',
            context: [
                'resource' => $filename,
                'rows' => $total,
                // What was asked for, so an export can be reproduced exactly
                // during an investigation. Redacted like any other context.
                'filters' => $request->query('filter'),
                'sort' => $request->query('sort'),
            ],
        );

        $headers = $this->resolveHeaders($query, $resource, $columns, $request);

        return response()->streamDownload(
            function () use ($query, $resource, $headers, $request): void {
                $handle = fopen('php://output', 'wb');

                if ($handle === false) {
                    return;
                }

                /*
                 * UTF-8 BOM. Without it, Excel on Windows reads the file in the
                 * system codepage and every Arabic customer name and currency
                 * symbol arrives as mojibake.
                 */
                fwrite($handle, "\xEF\xBB\xBF");

                fputcsv($handle, array_values($headers));

                $query->chunkById(
                    $this->chunkSize(),
                    function ($rows) use ($handle, $resource, $headers, $request): void {
                        foreach ($rows as $model) {
                            $serialised = $this->serialise($resource, $model, $request);

                            $line = [];

                            foreach (array_keys($headers) as $path) {
                                $line[] = CsvCell::escape(Arr::get($serialised, $path));
                            }

                            fputcsv($handle, $line);
                        }

                        // Push each chunk to the client rather than letting the
                        // whole file accumulate in the output buffer — the
                        // difference between flat memory and a fatal.
                        flush();
                    }
                );

                fclose($handle);
            },
            $filename.'-'.now()->format('Y-m-d').'.csv',
            [
                'Content-Type' => 'text/csv; charset=UTF-8',
                'X-Content-Type-Options' => 'nosniff',
            ],
        );
    }

    /**
     * Drops every column the requesting role may not see.
     *
     * Presence is decided on the FIRST SEGMENT of the path against one
     * serialised row, because that is where `mergeWhen` operates: a redacted
     * field is an absent top-level key, while a nested path such as
     * `customer.name` keeps its `customer` key even when the relation is null.
     * Testing the full path would drop a legitimate column whenever the sample
     * row happened to have an empty relation.
     *
     * One row can decide this for all of them because the key set is a function
     * of the requesting user's abilities, not of the row.
     *
     * @param  Builder<covariant Model>  $query
     * @param  class-string<JsonResource>  $resource
     * @param  array<string, string>  $columns
     * @return array<string, string>
     */
    private function resolveHeaders(
        Builder $query,
        string $resource,
        array $columns,
        Request $request,
    ): array {
        $sample = (clone $query)->first();

        if ($sample === null) {
            /*
             * No rows to judge by. Every header is written and the file is
             * empty, which is the honest answer: the filter matched nothing.
             * Omitting columns here would say "these fields do not exist",
             * which is a different and false statement.
             */
            return $columns;
        }

        $serialised = $this->serialise($resource, $sample, $request);

        return array_filter(
            $columns,
            static fn (string $path): bool => array_key_exists(
                explode('.', $path)[0],
                $serialised,
            ),
            ARRAY_FILTER_USE_KEY,
        );
    }

    /**
     * `resolve()`, NOT `toArray()`.
     *
     * `mergeWhen` does not return the merged keys from `toArray` — it inserts
     * an int-keyed MergeValue placeholder that Laravel flattens later, in the
     * response pipeline. Reading `toArray` directly therefore finds no `cost`
     * key for ANY role, and the column vanishes from every export.
     *
     * That failure is silent and it fails CLOSED, which is why it is worth a
     * comment: nothing leaks, no error is raised, and the only symptom is a
     * missing column in a file nobody diffs against the screen. `resolve()`
     * runs the same filtering the API response does, so what the exporter sees
     * is exactly what the endpoint would have returned — which is the whole
     * premise of inheriting redaction rather than reimplementing it.
     *
     * @param  class-string<JsonResource>  $resource
     * @return array<string, mixed>
     */
    private function serialise(string $resource, Model $model, Request $request): array
    {
        /** @var array<string, mixed> $array */
        $array = $resource::make($model)->resolve($request);

        return $array;
    }
}
