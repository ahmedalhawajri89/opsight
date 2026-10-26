<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Audit\AuditRecorder;
use App\Domain\Integrations\ClaimStore;
use App\Http\Controllers\Controller;
use App\Http\Requests\Integrations\ClaimStoreRequest;
use App\Http\Resources\IntegrationResource;
use App\Models\Integration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Resources\Json\AnonymousResourceCollection;

/**
 * The stores a business has connected.
 *
 * Three things only: see them, claim one, cut one off. Everything else an
 * integration does happens to it rather than through it — tokens refresh
 * themselves, deliveries arrive at the webhook door.
 */
class IntegrationController extends Controller
{
    public function index(): AnonymousResourceCollection
    {
        $this->authorize('viewAny', Integration::class);

        return IntegrationResource::collection(
            Integration::query()->orderBy('provider')->get()
        );
    }

    /**
     * Claiming a store that has installed the app.
     *
     * Deliberately indistinguishable, from outside, between "no such pending
     * store", "it expired" and "someone else has it". All three are answered
     * 404 with one message: telling an owner which store ids exist, or which
     * are already taken, turns this into a way to enumerate other people's
     * shops.
     */
    public function claim(ClaimStoreRequest $request, ClaimStore $claim, AuditRecorder $recorder): JsonResponse
    {
        $this->authorize('create', Integration::class);

        $provider = (string) $request->string('provider');
        $storeId = (string) $request->string('store_id');

        $integration = $claim($provider, $storeId);

        if ($integration === null) {
            /*
             * Audited even though nothing happened — especially because
             * nothing happened. A run of these from one account is somebody
             * trying store ids, and this row is the only place that shows.
             */
            $recorder->record(
                action: 'integration.claim_failed',
                context: ['provider' => $provider, 'store_id' => $storeId],
            );

            return response()->json([
                'message' => __('errors.integrations.claim_not_found'),
                'code' => 'integration.not_claimable',
            ], 404);
        }

        $recorder->record(
            action: 'integration.claimed',
            subject: $integration,
            context: ['provider' => $provider, 'store_id' => $storeId],
        );

        return (new IntegrationResource($integration))->response()->setStatusCode(201);
    }

    /**
     * Disconnecting.
     *
     * The tokens go with the row, which is the point: a disconnection that
     * left a working key in the database would be a disconnection in name.
     * Imported records stay — they are this business's history now, and
     * deleting them because a connection ended would be the integration
     * reaching back into the books.
     */
    public function destroy(Integration $integration, AuditRecorder $recorder): JsonResponse
    {
        $this->authorize('delete', $integration);

        $recorder->record(
            action: 'integration.disconnected',
            subject: $integration,
            context: ['provider' => $integration->provider, 'store_id' => $integration->external_account_id],
        );

        $integration->delete();

        return response()->json(null, 204);
    }
}
