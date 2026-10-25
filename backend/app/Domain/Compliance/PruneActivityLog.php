<?php

declare(strict_types=1);

namespace App\Domain\Compliance;

use App\Domain\Audit\AuditRecorder;
use App\Models\ActivityLog;
use App\Models\BusinessSetting;
use App\Support\Tenancy\BusinessScope;
use Carbon\CarbonImmutable;

/**
 * Deleting audit entries past the business's own retention window (ADR-026).
 *
 * Runs INSIDE a tenant context — `ActivityLog` carries `ScopedToBusiness`, so
 * the query is already `WHERE business_id = ? AND created_at < ?`, which lands
 * on the composite index the tenancy migration created. The command owns the
 * loop over businesses; this owns one business's prune.
 */
final class PruneActivityLog
{
    /**
     * Deleted in batches rather than one statement.
     *
     * A two-year-old installation's first run could remove millions of rows,
     * and a single DELETE would hold one long transaction and write the whole
     * thing to the binlog at once.
     */
    private const BATCH = 1000;

    public function __construct(private readonly AuditRecorder $recorder) {}

    /** @return int rows deleted (or, on a dry run, rows that would be) */
    public function __invoke(?int $daysOverride = null, bool $dryRun = false): int
    {
        $days = $daysOverride ?? BusinessSetting::current()->activity_retention_days;
        $cutoff = CarbonImmutable::now()->subDays($days);

        $stale = fn () => ActivityLog::query()->where('created_at', '<', $cutoff);

        if ($dryRun) {
            return $stale()->count();
        }

        $total = 0;

        do {
            $batch = $stale()->limit(self::BATCH)->delete();
            $total += $batch;
        } while ($batch === self::BATCH);

        if ($total > 0) {
            /*
             * Recorded AFTER the delete, so the row describing the prune is
             * not swept away by the prune it describes.
             */
            $this->recorder->record(
                action: 'activity.pruned',
                context: [
                    'deleted' => $total,
                    'retention_days' => $days,
                    'cutoff' => $cutoff->toIso8601String(),
                ],
            );
        }

        return $total;
    }

    /**
     * Rows belonging to no business, at the most conservative window.
     *
     * A failed sign-in for an address matching no account has a NULL
     * `business_id` (`ActivityLog::businessIsOptional()`), which means
     * `BusinessScope` hides it from every per-business pass — so without this
     * they would never be pruned at all, and a table that only grows is a slow
     * leak. They are kept for the LONGEST window any business has configured:
     * a row belonging to nobody gets the most cautious treatment.
     */
    public function orphans(?int $daysOverride = null, bool $dryRun = false): int
    {
        $days = $daysOverride ?? (int) BusinessSetting::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->max('activity_retention_days');

        if ($days <= 0) {
            return 0;
        }

        $cutoff = CarbonImmutable::now()->subDays($days);

        $stale = fn () => ActivityLog::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->whereNull('business_id')
            ->where('created_at', '<', $cutoff);

        if ($dryRun) {
            return $stale()->count();
        }

        $total = 0;

        do {
            $batch = $stale()->limit(self::BATCH)->delete();
            $total += $batch;
        } while ($batch === self::BATCH);

        return $total;
    }
}
