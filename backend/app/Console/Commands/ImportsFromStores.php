<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Integrations\Backfill;
use App\Domain\Integrations\Connector;
use App\Models\Business;
use App\Models\Integration;
use App\Support\Tenancy\BusinessScope;
use Illuminate\Console\Command;
use Throwable;

/**
 * What every "import a date range from connected stores" command shares
 * (ADR-029, ADR-037).
 *
 * One store's outage must not stop the others, and the orders already
 * imported from it stay imported: each is its own transaction, so running
 * the command again completes a partial import rather than redoing the lot.
 */
abstract class ImportsFromStores extends Command
{
    protected function importFrom(Connector $connector, Backfill $backfill): int
    {
        $from = (string) $this->argument('from');
        $to = (string) $this->argument('to');
        $dryRun = (bool) $this->option('dry-run');
        $label = ucfirst($connector->provider());

        if ($dryRun) {
            $this->components->info('Dry run: nothing will be written.');
        }

        $connections = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', $connector->provider())
            ->where('status', Integration::STATUS_CONNECTED)
            ->when($this->option('business'), fn ($query, $id) => $query->where('business_id', $id))
            ->orderBy('business_id')
            ->get();

        if ($connections->isEmpty()) {
            $this->components->warn("No connected {$label} store to import from.");

            return self::SUCCESS;
        }

        $failures = 0;

        foreach ($connections as $connection) {
            $name = Business::query()->whereKey($connection->business_id)->value('name') ?? $connection->business_id;

            try {
                $counts = $backfill->run(
                    $connector,
                    $connection,
                    $from,
                    $to,
                    withProducts: ! $this->option('skip-products'),
                    dryRun: $dryRun,
                );

                $this->components->twoColumnDetail((string) $name, "{$counts['products']} products, {$counts['orders']} orders");
            } catch (Throwable $e) {
                report($e);
                $this->components->error("{$name}: ".$e->getMessage());
                $failures++;
            }
        }

        return $failures === 0 ? self::SUCCESS : self::FAILURE;
    }
}
