<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Audit\AuditRecorder;
use App\Domain\Integrations\WebhookProviders;
use App\Http\Controllers\Controller;
use App\Jobs\ProcessWebhookReceipt;
use App\Models\WebhookReceipt;
use Illuminate\Database\QueryException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Receiving a delivery from a provider (ADR-027).
 *
 * FIVE THINGS, IN THIS ORDER, AND THE ORDER IS THE DESIGN:
 *
 * 1. Is this a provider we accept at all? An unknown name is a 404, not a
 *    stored row — otherwise the table is a free write for anyone.
 * 2. Is the body small enough to be a real delivery? The signature cannot be
 *    checked until the body has been read, so the body is the one thing an
 *    attacker controls before any check runs.
 * 3. Does the signature verify against our shared secret? A failure is
 *    STORED and then refused with 401: the row is the evidence that someone
 *    tried, or that a secret has rotated.
 * 4. Store, keyed by the provider's own event id. A duplicate is answered
 *    200 and goes no further — every provider retries, and a retry must not
 *    make a second order.
 * 5. Answer 200 immediately and do the work in a job. A provider waiting on
 *    a synchronous import will time out and retry, which produces the
 *    duplicate that step 4 exists to prevent.
 *
 * Unauthenticated by necessity: a provider has no session. The signature is
 * the authentication.
 */
class WebhookController extends Controller
{
    public function __invoke(
        Request $request,
        string $provider,
        WebhookProviders $providers,
        AuditRecorder $recorder,
    ): JsonResponse {
        $handler = $providers->get($provider);
        $secret = $providers->secretFor($provider);

        if ($handler === null || $secret === null) {
            // Not "unauthorized": from outside, an unconfigured provider and
            // a misspelt one are the same thing, and neither should reveal
            // which providers this installation has connected.
            abort(404);
        }

        $body = $request->getContent();

        if (strlen($body) > $providers->maxPayloadBytes()) {
            abort(413);
        }

        $signature = (string) $request->header($handler->signatureHeader(), '');
        $verified = $signature !== '' && $handler->verify($body, $signature, $secret);

        /** @var array<string, mixed> $payload */
        $payload = json_decode($body, true) ?: [];

        if (! $verified) {
            /*
             * Stored before refusing. A delivery that fails verification is
             * the most interesting row in this table — and storing it is also
             * what lets an operator tell "the secret rotated last Tuesday"
             * from "someone is probing us".
             */
            WebhookReceipt::query()->create([
                'business_id' => null,
                'provider' => $provider,
                'event' => 'unverified',
                'external_event_id' => 'unverified:'.$provider.':'.hash('sha256', $body.$signature),
                'payload' => $payload,
                'signature_ok' => false,
            ]);

            $recorder->record(
                action: 'webhook.rejected',
                context: ['provider' => $provider, 'reason' => 'signature'],
            );

            abort(401);
        }

        $eventId = $handler->externalEventId($payload);

        /*
         * A retry is answered, not re-queued. Every provider retries on a
         * slow response or a network blip, and handling the same delivery
         * twice is how an importer produces two of one order.
         *
         * Checked first for the common case, and the unique index catches
         * the race where two deliveries arrive at once — belt and braces,
         * because the index is the only one of the two that cannot lose.
         */
        if (WebhookReceipt::query()->where('external_event_id', $eventId)->exists()) {
            return response()->json(['status' => 'duplicate'], 202);
        }

        // Only now is the payload trusted to name a business.
        $businessId = $handler->businessIdFor($payload);

        try {
            $receipt = WebhookReceipt::query()->create([
                'business_id' => $businessId,
                'provider' => $provider,
                'event' => $handler->event($payload),
                'external_event_id' => $eventId,
                'payload' => $payload,
                'signature_ok' => true,
            ]);
        } catch (QueryException $e) {
            if (! $this->isDuplicate($e)) {
                throw $e;
            }

            return response()->json(['status' => 'duplicate'], 202);
        }

        if ($businessId === null) {
            /*
             * Genuine, and for a store we do not know — most likely one that
             * disconnected while a delivery was in flight. Kept with its
             * reason rather than queued: a job with no business cannot run,
             * and failing it four times would say nothing this row does not.
             */
            $receipt->markFailed('No connected business matches this delivery.');

            $recorder->record(
                action: 'webhook.unmatched',
                context: ['provider' => $provider, 'event' => $receipt->event],
            );

            return response()->json(['status' => 'accepted'], 202);
        }

        ProcessWebhookReceipt::dispatch($receipt->id, $businessId);

        // 202: accepted, not yet acted on. Saying 200 "OK" for work that has
        // not happened is the kind of small lie that costs an afternoon.
        return response()->json(['status' => 'accepted'], 202);
    }

    /** MySQL 1062 / SQLSTATE 23000: the unique index did its job. */
    private function isDuplicate(QueryException $e): bool
    {
        return ($e->errorInfo[1] ?? null) === 1062 || $e->getCode() === '23000';
    }
}
