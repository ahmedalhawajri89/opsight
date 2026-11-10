<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Audit\AuditRecorder;
use App\Domain\Integrations\Zid\ConnectZidStore;
use App\Domain\Integrations\Zid\ZidRefused;
use App\Domain\Integrations\Zid\ZidStoreTaken;
use App\Http\Controllers\Controller;
use App\Http\Resources\IntegrationResource;
use App\Models\Integration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Connecting a Zid store through Zid's own consent screen (ADR-037).
 *
 * Two requests, both from the signed-in owner. The first returns the URL to
 * send their browser to. Zid then sends the browser back to the frontend's
 * callback page, which hands the code and the state to the second.
 *
 * The callback is a POST from our own page rather than Zid redirecting to the
 * API directly, so it runs in the owner's session: the state is checked
 * against the user who began the flow, which a bare redirect could not do.
 */
class ZidConnectionController extends Controller
{
    public function authorizeUrl(Request $request, ConnectZidStore $connect): JsonResponse
    {
        $this->authorize('create', Integration::class);

        if (! $this->configured()) {
            return response()->json([
                'message' => __('errors.integrations.zid_unavailable'),
                'code' => 'integration.unavailable',
            ], 503);
        }

        return response()->json(['data' => ['url' => $connect->begin((int) $request->user()?->getKey())]]);
    }

    public function callback(Request $request, ConnectZidStore $connect, AuditRecorder $recorder): JsonResponse
    {
        $this->authorize('create', Integration::class);

        $input = $request->validate([
            'code' => ['required', 'string', 'max:2048'],
            'state' => ['required', 'string', 'max:128'],
        ]);

        try {
            $integration = $connect->complete($input['code'], $input['state'], (int) $request->user()?->getKey());
        } catch (ZidStoreTaken $taken) {
            $recorder->record(
                action: 'integration.connect_refused',
                context: ['provider' => 'zid', 'store_id' => $taken->storeId, 'reason' => 'taken'],
            );

            return response()->json([
                'message' => __('errors.integrations.zid_taken'),
                'code' => 'integration.taken',
            ], 409);
        } catch (ZidRefused $refused) {
            return response()->json([
                'message' => __('errors.integrations.zid_refused'),
                'code' => 'integration.refused',
            ], 422);
        }

        if ($integration === null) {
            return response()->json([
                'message' => __('errors.integrations.zid_state'),
                'code' => 'integration.state_invalid',
            ], 422);
        }

        $recorder->record(
            action: 'integration.connected',
            subject: $integration,
            context: ['provider' => 'zid', 'store_id' => $integration->external_account_id],
        );

        return (new IntegrationResource($integration))->response()->setStatusCode(201);
    }

    private function configured(): bool
    {
        return filled(config('integrations.zid.client_id'))
            && filled(config('integrations.zid.client_secret'))
            && filled(config('integrations.zid.redirect_uri'));
    }
}
