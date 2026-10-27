<?php

declare(strict_types=1);

namespace App\Jobs;

use App\Domain\Integrations\WebhookProviders;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Throwable;

/**
 * A verified delivery that belongs to no business yet.
 *
 * There is exactly one kind: the event that CREATES a connection. Salla's
 * Easy mode delivers a store's tokens in `app.store.authorize`, and that
 * delivery is the first this installation has ever heard of the store — so
 * there is nothing for the door to match it against, and the ordinary job
 * would be wrong to run it.
 *
 * NO `WithBusinessContext` MIDDLEWARE, and that absence is the design. That
 * middleware exists to refuse a job with no business, because a job that ran
 * "for everyone" would read across the whole installation. This job has no
 * business legitimately, so instead of weakening the rule for every queued
 * job, it is a different job — one whose handler may only touch rows that
 * belong to nobody either.
 *
 * It is NOT a back door into business data. The provider decides, per event
 * name, whether an unmatched delivery is acceptable at all, and nothing here
 * sets a business context for the handler to inherit.
 */
class ProcessUnclaimedDelivery implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    /** As ProcessWebhookReceipt: a provider outage outlasts four tries anyway. */
    public int $tries = 4;

    /** @var list<int> seconds between attempts */
    public array $backoff = [10, 60, 300];

    public function __construct(public readonly int $receiptId) {}

    public function uniqueId(): string
    {
        // The same key as the business-scoped job: one receipt is handled by
        // one job, whichever of the two it turns out to be.
        return 'webhook-receipt-'.$this->receiptId;
    }

    public function handle(WebhookProviders $providers): void
    {
        $receipt = WebhookReceipt::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->find($this->receiptId);

        if ($receipt === null || $receipt->isProcessed()) {
            return;
        }

        if ($receipt->business_id !== null) {
            // It was claimed between queueing and running. The business-scoped
            // job is the one that should handle it, and running it here would
            // be running business work with no business in context.
            $receipt->markFailed('Receipt belongs to a business; it is not an unclaimed delivery.');

            return;
        }

        $provider = $providers->get($receipt->provider);

        if ($provider === null) {
            $receipt->markFailed("No handler registered for provider '{$receipt->provider}'.");

            return;
        }

        if (! $provider->acceptsUnmatched($receipt->event)) {
            // The provider was changed after the delivery was queued. Refusing
            // is the safe response: this job's whole licence is that the
            // provider said this event may arrive ownerless.
            $receipt->markFailed("Provider '{$receipt->provider}' does not accept '{$receipt->event}' without a business.");

            return;
        }

        $receipt->forceFill(['attempts' => $receipt->attempts + 1])->save();

        try {
            $provider->handle($receipt);
            $receipt->markProcessed();
        } catch (Throwable $e) {
            $receipt->markFailed($e->getMessage());

            throw $e;
        }
    }
}
