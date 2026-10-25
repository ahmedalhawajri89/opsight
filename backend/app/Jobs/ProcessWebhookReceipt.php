<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domain\Integrations\WebhookProviders;
use App\Jobs\Middleware\WithBusinessContext;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * Acts on a delivery that has already been stored and verified (ADR-027).
 *
 * THE FIRST QUEUED JOB IN THIS SYSTEM. ADR-011 said there would be none until
 * something needed one; a webhook is that something, because the provider is
 * waiting on the response and will retry if it is slow. The endpoint stores,
 * answers 200, and leaves the work here.
 *
 * It carries an ID, not a model. A queued model is serialised and re-fetched
 * through `SerializesModels`, whose re-fetch runs through the global scope
 * with no business in context — the row would come back missing. The id plus
 * an explicit business is both smaller and honest about what the worker has
 * to re-establish.
 *
 * Unique by receipt for as long as it might still be queued, so two
 * deliveries of the same event racing each other cannot both be handled. The
 * database-level unique on `external_event_id` already stops the second
 * receipt existing; this stops two jobs for one receipt.
 */
class ProcessWebhookReceipt implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    /** Four tries over a few minutes; a provider outage outlasts that anyway. */
    public int $tries = 4;

    /** @var list<int> seconds between attempts */
    public array $backoff = [10, 60, 300];

    public function __construct(
        public readonly int $receiptId,
        public readonly ?int $businessId,
    ) {}

    public function uniqueId(): string
    {
        return 'webhook-receipt-'.$this->receiptId;
    }

    /** @return array<int, object> */
    public function middleware(): array
    {
        return [new WithBusinessContext];
    }

    public function handle(WebhookProviders $providers): void
    {
        /*
         * Read without the scope, then checked against this job's business by
         * hand. The receipt is written by an unauthenticated request and is
         * deliberately unscoped (see the model); fetching it through a scope
         * that is not applied to its table would be a false reassurance, so
         * the check is written where a reader can see it.
         */
        $receipt = WebhookReceipt::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->find($this->receiptId);

        if ($receipt === null || $receipt->isProcessed()) {
            return;
        }

        if ($receipt->business_id !== $this->businessId) {
            // The receipt changed hands between queueing and running, which
            // should be impossible. Refusing is the only safe response.
            $receipt->markFailed('Receipt does not belong to the business this job was queued for.');

            return;
        }

        $provider = $providers->get($receipt->provider);

        if ($provider === null) {
            // The provider was de-registered after the delivery arrived. The
            // receipt stays unprocessed and says why, rather than vanishing.
            $receipt->markFailed("No handler registered for provider '{$receipt->provider}'.");

            return;
        }

        $receipt->forceFill(['attempts' => $receipt->attempts + 1])->save();

        try {
            $provider->handle($receipt);
            $receipt->markProcessed();
        } catch (Throwable $e) {
            // Recorded on the row AND rethrown: the row is what an operator
            // reads, and the rethrow is what makes the queue retry.
            $receipt->markFailed($e->getMessage());

            throw $e;
        }
    }
}
