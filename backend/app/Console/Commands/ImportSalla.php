<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Integrations\Salla\ImportSallaOrder;
use App\Domain\Integrations\Salla\SallaClient;
use App\Domain\Integrations\Salla\SallaWebhooks;
use App\Models\Business;
use App\Models\Integration;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Console\Command;
use Throwable;

/**
 * The history a store already had before it connected (ADR-029).
 *
 * Webhooks only ever bring what happens next. Without this, a merchant who
 * connects on Tuesday sees a dashboard that says their business began on
 * Tuesday — which is not a gap in the data so much as a reason not to trust
 * the product.
 *
 * SAFE TO RUN AGAIN, AND AGAIN. Every order goes through the same importer
 * the webhooks use, which finds its row by `(source, external_id)`; a second
 * run over the same dates updates rather than duplicates. That is what makes
 * "it failed half way, run it again" an acceptable answer rather than a
 * cleanup job.
 *
 * It does NOT skip orders it has already seen. Re-reading one is cheap, and
 * skipping would mean an order edited in Salla after its first import stayed
 * wrong here for ever.
 */
class ImportSalla extends Command
{
    protected $signature = 'opsight:salla:import
        {from : First day to import, yyyy-mm-dd}
        {to : Last day, inclusive}
        {--business= : One business id; all connected businesses when omitted}
        {--dry-run : Count what would be imported, and write nothing}';

    protected $description = 'Import a date range of orders from each connected store';

    public function handle(SallaClient $client, ImportSallaOrder $import): int
    {
        $from = (string) $this->argument('from');
        $to = (string) $this->argument('to');
        $dryRun = (bool) $this->option('dry-run');

        if ($dryRun) {
            $this->components->info('Dry run: nothing will be written.');
        }

        $connections = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', SallaWebhooks::PROVIDER)
            ->where('status', Integration::STATUS_CONNECTED)
            ->when($this->option('business'), fn ($query, $id) => $query->where('business_id', $id))
            ->orderBy('business_id')
            ->get();

        if ($connections->isEmpty()) {
            $this->components->warn('No connected Salla store to import from.');

            return self::SUCCESS;
        }

        $failures = 0;

        foreach ($connections as $connection) {
            $name = Business::query()->whereKey($connection->business_id)->value('name') ?? $connection->business_id;

            try {
                $imported = CurrentBusiness::get()->run(
                    (int) $connection->business_id,
                    fn (): int => $this->importStore($client, $import, $connection, $from, $to, $dryRun),
                );

                $this->components->twoColumnDetail((string) $name, "{$imported} orders");
            } catch (Throwable $e) {
                /*
                 * One store's outage must not stop the others, and the
                 * orders already imported from this one stay imported — each
                 * is its own transaction, so a failure half way leaves a
                 * partial import that running again completes rather than a
                 * rollback of the lot.
                 */
                report($e);
                $this->components->error("{$name}: ".$e->getMessage());
                $failures++;
            }
        }

        return $failures === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function importStore(
        SallaClient $client,
        ImportSallaOrder $import,
        Integration $connection,
        string $from,
        string $to,
        bool $dryRun,
    ): int {
        $count = 0;

        foreach ($client->each($connection, 'orders', ['from_date' => $from, 'to_date' => $to]) as $order) {
            $count++;

            if ($dryRun) {
                continue;
            }

            $import($order);
        }

        if (! $dryRun && $count > 0) {
            $connection->forceFill(['last_synced_at' => now()])->save();
        }

        return $count;
    }
}
