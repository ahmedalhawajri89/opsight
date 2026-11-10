<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domain\Integrations\Backfill;
use App\Domain\Integrations\Connectors;
use App\Jobs\Middleware\WithBusinessContext;
use App\Models\Integration;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * The history a store had before it connected, fetched once, just after it
 * does (ADR-029, ADR-037).
 *
 * Without this a newly connected store shows a dashboard that begins today,
 * and the owner's first impression of the product is an empty one. The same
 * Backfill the command uses, so running the command afterwards over the same
 * days changes nothing.
 *
 * Carries ids, not models, for the reason ProcessWebhookReceipt gives: a
 * serialised model is re-fetched through a scope with no business in context.
 */
class ImportStoreHistory implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    /** How far back a first import reaches. A year covers last Ramadan. */
    public const DAYS = 365;

    public int $tries = 3;

    /** @var list<int> */
    public array $backoff = [60, 300];

    /** A year of a busy store is many pages; give it room. */
    public int $timeout = 1800;

    public function __construct(
        public readonly int $integrationId,
        public readonly ?int $businessId,
    ) {}

    public function uniqueId(): string
    {
        return 'store-history-'.$this->integrationId;
    }

    /** @return array<int, object> */
    public function middleware(): array
    {
        return [new WithBusinessContext];
    }

    public function handle(Connectors $connectors, Backfill $backfill): void
    {
        $integration = Integration::query()->find($this->integrationId);

        if ($integration === null || ! $integration->isUsable()) {
            return;
        }

        $connector = $connectors->get($integration->provider);

        if ($connector === null) {
            return;
        }

        $today = CarbonImmutable::now();

        try {
            $backfill->run(
                $connector,
                $integration,
                $today->subDays(self::DAYS)->toDateString(),
                $today->toDateString(),
            );
        } catch (Throwable $e) {
            // Written where the owner sees it, then rethrown so the queue
            // retries and, finally, records the failure.
            $integration->forceFill(['last_error' => 'The store\'s history could not be imported: '.$e->getMessage()])->save();

            throw $e;
        }
    }
}
