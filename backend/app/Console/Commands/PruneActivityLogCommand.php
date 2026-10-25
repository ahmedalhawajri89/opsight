<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Compliance\PruneActivityLog;
use App\Models\Business;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Console\Command;
use Throwable;

/**
 * Trims every business's audit log to the window it configured (ADR-026).
 *
 * Scheduled nightly in routes/console.php. Runs per business, in that
 * business's own tenant context, then sweeps the rows that belong to no
 * business at all.
 */
class PruneActivityLogCommand extends Command
{
    protected $signature = 'opsight:prune-activity
                            {--business= : Prune one business only, by id}
                            {--days= : Override every business\'s configured window}
                            {--dry-run : Report what would be deleted, and delete nothing}';

    protected $description = "Delete activity log entries older than each business's retention window";

    public function handle(PruneActivityLog $prune): int
    {
        $days = $this->option('days') !== null ? (int) $this->option('days') : null;
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun) {
            $this->components->info('Dry run: nothing will be deleted.');
        }

        // `Business` is the tenant root and carries no scope of its own, so
        // this is the one query here that is deliberately global.
        $businesses = Business::query()
            ->when($this->option('business'), fn ($query, $id) => $query->whereKey($id))
            ->orderBy('id');

        $failures = 0;
        $total = 0;

        foreach ($businesses->cursor() as $business) {
            try {
                $deleted = CurrentBusiness::get()->run(
                    $business->id,
                    fn (): int => $prune($days, $dryRun),
                );
            } catch (Throwable $e) {
                /*
                 * ONE BROKEN TENANT MUST NOT STOP THE REST. A business whose
                 * settings row is missing would otherwise abort the nightly
                 * run at business three and leave every later one unpruned for
                 * ever — silently, because nobody reads a cron's stderr.
                 */
                report($e);
                $this->components->error("business {$business->id}: ".$e->getMessage());
                $failures++;

                continue;
            }

            $total += $deleted;
            $this->components->twoColumnDetail($business->name, (string) $deleted);
        }

        // Only on a full run: a single-business pass should not sweep rows
        // that belong to none.
        if ($this->option('business') === null) {
            $orphans = $prune->orphans($days, $dryRun);
            $total += $orphans;
            $this->components->twoColumnDetail('<fg=gray>no business</>', (string) $orphans);
        }

        $this->components->info($dryRun ? "{$total} entries would be deleted." : "{$total} entries deleted.");

        return $failures === 0 ? self::SUCCESS : self::FAILURE;
    }
}
