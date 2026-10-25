<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Schema;

/**
 * The public demo's data, saved once and restored every night
 * (docs/DEPLOYMENT.md).
 *
 * Seeding the demo from nothing takes minutes — DemoDataSeeder writes three
 * years of orders through the same domain code the application uses, stock
 * ledger and all — and the platform the demo runs on stops a scheduled job
 * after a minute. So the seeded state is captured here, one gzipped JSON file
 * per table, committed with the code, and put back in bulk in seconds.
 *
 * A restore moves every date forward by the whole weeks since the capture.
 * The history then still ends this week rather than ageing a day each night,
 * and a Sunday stays a Sunday, which the working-week settings and the
 * weekday analytics both depend on.
 */
final class DemoSnapshot
{
    /*
     * Not data: the schema's own record (owned by `migrate`), queues, caches,
     * sessions and credentials that belong to whoever used them.
     */
    public const SKIP = [
        'migrations', 'jobs', 'failed_jobs', 'job_batches', 'cache', 'cache_locks',
        'sessions', 'password_reset_tokens', 'personal_access_tokens',
    ];

    private const DATE = '/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}:\d{2})?$/';

    public function __construct(private readonly string $path) {}

    public static function default(): self
    {
        return new self(database_path('demo'));
    }

    public function exists(): bool
    {
        return File::exists($this->path.'/meta.json');
    }

    /**
     * Saves every table of the current database.
     *
     * @return array{tables: int, rows: int}
     */
    public function capture(): array
    {
        $tables = $this->allTables();

        File::ensureDirectoryExists($this->path.'/db');
        File::cleanDirectory($this->path.'/db');

        $rows = 0;

        foreach ($tables as $table) {
            $data = DB::table($table)->get()->map(static fn (object $row): array => (array) $row)->all();
            $rows += count($data);

            File::put($this->path."/db/{$table}.json.gz", gzencode(json_encode($data, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR), 9));
        }

        File::put($this->path.'/meta.json', json_encode([
            'taken_at' => now()->toIso8601String(),
            'tables' => $tables,
        ], JSON_PRETTY_PRINT | JSON_THROW_ON_ERROR)."\n");

        return ['tables' => count($tables), 'rows' => $rows];
    }

    /**
     * Replaces every saved table's rows with the snapshot's, dates moved
     * forward by whole weeks. The schema must already be migrated.
     *
     * @return array{tables: int, rows: int, shifted_days: int}
     */
    public function restore(?Carbon $now = null): array
    {
        $meta = json_decode(File::get($this->path.'/meta.json'), true, flags: JSON_THROW_ON_ERROR);

        $days = (int) Carbon::parse($meta['taken_at'])->startOfDay()
            ->diffInDays(($now ?? now())->copy()->startOfDay(), false);
        $shift = intdiv(max(0, $days), 7) * 7;

        $rows = 0;

        // The values are UTC and the connection is UTC (config/database.php),
        // so a date moved into the hour a summer-time zone skips still saves.
        Schema::disableForeignKeyConstraints();

        try {
            foreach ($meta['tables'] as $table) {
                $file = $this->path."/db/{$table}.json.gz";

                if (! Schema::hasTable($table) || ! File::exists($file)) {
                    continue;
                }

                DB::table($table)->delete();

                $data = json_decode((string) gzdecode(File::get($file)), true, flags: JSON_THROW_ON_ERROR);

                foreach (array_chunk($data, 500) as $chunk) {
                    DB::table($table)->insert(array_map(fn (array $row): array => $this->shift($row, $shift), $chunk));
                }

                $rows += count($data);
            }
        } finally {
            Schema::enableForeignKeyConstraints();
        }

        return ['tables' => count($meta['tables']), 'rows' => $rows, 'shifted_days' => $shift];
    }

    /**
     * Every value shaped like a date is moved, whatever its column is called:
     * a date column added after the capture is moved too, with no list to keep.
     *
     * @param  array<string, mixed>  $row
     * @return array<string, mixed>
     */
    private function shift(array $row, int $days): array
    {
        if ($days === 0) {
            return $row;
        }

        foreach ($row as $column => $value) {
            if (is_string($value) && preg_match(self::DATE, $value) === 1) {
                $at = Carbon::parse($value)->addDays($days);
                $row[$column] = strlen($value) === 10 ? $at->toDateString() : $at->toDateTimeString();
            }
        }

        return $row;
    }

    /** @return list<string> */
    private function allTables(): array
    {
        $database = DB::connection()->getDatabaseName();

        return collect(DB::select(
            'SELECT TABLE_NAME AS t FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = ? ORDER BY TABLE_NAME',
            [$database, 'BASE TABLE'],
        ))
            ->pluck('t')
            ->reject(static fn (string $table): bool => in_array($table, self::SKIP, true))
            ->values()
            ->all();
    }
}
