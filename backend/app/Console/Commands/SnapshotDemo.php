<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\DemoSnapshot;
use Illuminate\Console\Command;

/**
 * Saves the current database as the public demo's snapshot, in
 * database/demo, for `demo:reset` to restore every night
 * (docs/DEPLOYMENT.md).
 *
 * Taken on a machine, from a database just built with
 * `migrate:fresh --seed` and DEMO_MODE on, then committed. Refuses on a
 * production installation that is not the demo: its data is real.
 */
class SnapshotDemo extends Command
{
    protected $signature = 'demo:snapshot';

    protected $description = 'Save the current database as the demo snapshot (database/demo)';

    public function handle(): int
    {
        if (app()->environment('production') && ! config('demo.enabled')) {
            $this->error('Refused: a production database that is not the demo holds real data.');

            return self::FAILURE;
        }

        $saved = DemoSnapshot::default()->capture();

        $this->info("Snapshot saved: {$saved['tables']} tables, {$saved['rows']} rows, in database/demo.");

        return self::SUCCESS;
    }
}
