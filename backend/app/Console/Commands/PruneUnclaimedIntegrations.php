<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Models\UnclaimedIntegration;
use Carbon\CarbonImmutable;
use Illuminate\Console\Command;

/**
 * Throws away tokens nobody claimed.
 *
 * A pending row holds a live key to somebody's shop. Unclaimed, it is a
 * liability and nothing else: no screen reads it, no job uses it, and the
 * merchant it belongs to has already moved on. The claim window makes it
 * unusable after an hour; this is what makes it ALSO absent, which is the
 * difference between a rule and a fact.
 *
 * A merchant who misses the window reinstalls, which costs them a minute.
 */
class PruneUnclaimedIntegrations extends Command
{
    protected $signature = 'opsight:prune-unclaimed-integrations';

    protected $description = 'Delete store tokens that were never claimed';

    public function handle(): int
    {
        $deleted = UnclaimedIntegration::query()
            ->where('expires_at', '<', CarbonImmutable::now())
            ->delete();

        $this->info("Discarded {$deleted} unclaimed store connection(s).");

        return self::SUCCESS;
    }
}
