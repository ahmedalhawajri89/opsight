<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\DemoSnapshot;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Puts the public demo back as it was: the schema migrated, then every table
 * restored from the snapshot in database/demo with its dates moved up to this
 * week (App\Support\DemoSnapshot, docs/DEPLOYMENT.md).
 *
 * Fills a new demo database the first time, and runs every night after, so
 * whatever visitors changed or added is gone by the morning.
 *
 * Refuses to run without DEMO_MODE: on any other installation this is the
 * command that deletes everything.
 */
class ResetDemo extends Command
{
    protected $signature = 'demo:reset';

    protected $description = 'Restore the public demo from its snapshot (DEMO_MODE only)';

    public function handle(): int
    {
        if (! config('demo.enabled')) {
            $this->error('Refused: DEMO_MODE is not set. This command replaces every table.');

            return self::FAILURE;
        }

        $snapshot = DemoSnapshot::default();

        if (! $snapshot->exists()) {
            $this->error('No snapshot in database/demo. Build one first: php artisan demo:snapshot');

            return self::FAILURE;
        }

        $this->enforceCheckConstraintsOnTiDb();

        $this->call('migrate', ['--force' => true]);

        $restored = $snapshot->restore();

        $this->call('cache:clear');
        $this->info("Demo restored: {$restored['tables']} tables, {$restored['rows']} rows, dates moved {$restored['shifted_days']} days.");

        return self::SUCCESS;
    }

    /*
     * The demo runs on TiDB, which accepts CHECK constraints but, by default,
     * neither keeps nor enforces them. The migrations rely on both: they add
     * constraints that guard money and stock, and later drop some of them by
     * name, which fails when TiDB never kept them. Turning enforcement on makes
     * TiDB behave as MySQL does. It is a global setting, so it is set before
     * the migrations on every run, and the check is a no-op on MySQL.
     */
    private function enforceCheckConstraintsOnTiDb(): void
    {
        $version = (string) DB::selectOne('SELECT VERSION() AS v')->v;

        if (str_contains($version, 'TiDB')) {
            DB::statement('SET GLOBAL tidb_enable_check_constraint = ON');
            // A global setting reaches new connections; migrate on one.
            DB::purge();
            DB::reconnect();
            $this->info('TiDB: CHECK constraints enforced.');
        }
    }
}
