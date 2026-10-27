<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Domain\Integrations\Salla\SallaReconciler;
use App\Domain\Integrations\Salla\SallaWebhooks;
use App\Domain\Metrics\Period;
use App\Models\Business;
use App\Models\Integration;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Console\Command;
use Throwable;

/**
 * Asking Salla whether a period matches, and saying so out loud.
 *
 * THE ONE THING THAT WOULD CATCH A SILENT IMPORTER. An importer that drops
 * one order in fifty does not fail — it produces figures that are plausible,
 * slightly low and wrong, and nothing else in this system would ever
 * notice. The webhook retries, the queue is empty, the screens look fine.
 *
 * Run per business, because the figures are per business and a command that
 * averaged them would answer a question nobody asked.
 *
 * It exits non-zero when anything differs, so a nightly cron is an alarm
 * rather than a log nobody reads.
 */
class ReconcileSalla extends Command
{
    protected $signature = 'opsight:salla:reconcile
        {from : First day of the period, yyyy-mm-dd, in the business timezone}
        {to : Last day of the period, inclusive}
        {--business= : One business id; all connected businesses when omitted}';

    protected $description = 'Compare a period against Salla and print the differences';

    public function handle(SallaReconciler $reconcile): int
    {
        $connections = $this->connections();

        if ($connections === []) {
            $this->warn('No business has connected a Salla store.');

            // Not a failure: nothing to reconcile is a legitimate state, and
            // a cron that mails on exit code must not mail about it nightly.
            return self::SUCCESS;
        }

        $differed = false;

        foreach ($connections as $connection) {
            $differed = $this->reconcileOne($reconcile, $connection) || $differed;
        }

        return $differed ? self::FAILURE : self::SUCCESS;
    }

    private function reconcileOne(SallaReconciler $reconcile, Integration $connection): bool
    {
        $businessId = (int) $connection->business_id;
        $name = Business::query()->whereKey($businessId)->value('name') ?? "business {$businessId}";

        return CurrentBusiness::get()->run($businessId, function () use ($reconcile, $connection, $name): bool {
            try {
                /*
                 * The period is resolved INSIDE the business context, because
                 * its boundaries are its timezone's — resolving them outside
                 * would compare one business's days against another's
                 * (ADR-025).
                 */
                $period = Period::between((string) $this->argument('from'), (string) $this->argument('to'));

                $result = $reconcile($connection, $period);
            } catch (Throwable $e) {
                /*
                 * An error is reported as a FAILURE, never as agreement. A
                 * reconciliation that cannot read Salla has not found zero
                 * differences; it has found nothing, and the difference
                 * between those two is the whole value of this command.
                 */
                $this->error("{$name}: could not be reconciled — {$e->getMessage()}");

                return true;
            }

            $this->line("<options=bold>{$name}</> — store {$connection->external_account_id}");
            $this->table(
                ['', 'Opsight', 'Salla'],
                [
                    ['Orders', $result['ours']['orders'], $result['theirs']['orders']],
                    ['Revenue', $result['ours']['revenue'], $result['theirs']['revenue']],
                ],
            );

            if ($result['differences'] === []) {
                $this->info('No differences.');

                return false;
            }

            foreach ($result['differences'] as $difference) {
                $this->error("{$difference['what']}: Opsight has {$difference['ours']}, Salla has {$difference['theirs']}.");
            }

            return true;
        });
    }

    /** @return list<Integration> */
    private function connections(): array
    {
        $query = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', SallaWebhooks::PROVIDER)
            ->where('status', Integration::STATUS_CONNECTED);

        if ($this->option('business') !== null) {
            $query->where('business_id', (int) $this->option('business'));
        }

        return $query->get()->all();
    }
}
