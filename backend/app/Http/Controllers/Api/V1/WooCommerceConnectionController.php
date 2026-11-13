<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Audit\AuditRecorder;
use App\Domain\Integrations\WooCommerce\ConnectWooStore;
use App\Domain\Integrations\WooCommerce\WooRefused;
use App\Domain\Integrations\WooCommerce\WooStoreTaken;
use App\Http\Controllers\Controller;
use App\Http\Resources\IntegrationResource;
use App\Models\Integration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Connecting a WooCommerce store with a REST key made in it (2026-11-13).
 *
 * The owner pastes three things from WooCommerce > Settings > Advanced >
 * REST API: the store's address, the consumer key and the consumer secret.
 * A refusal from the store is said beside the field it concerns; the key is
 * never echoed back, logged or put in the audit row.
 */
class WooCommerceConnectionController extends Controller
{
    public function store(Request $request, ConnectWooStore $connect, AuditRecorder $recorder): JsonResponse
    {
        $this->authorize('create', Integration::class);

        $input = $request->validate([
            'url' => ['required', 'string', 'max:190'],
            // WooCommerce's own shapes, so a key pasted into the wrong box is
            // caught here rather than as a refusal from the store.
            'consumer_key' => ['required', 'string', 'regex:/^ck_[A-Za-z0-9]{20,64}$/'],
            'consumer_secret' => ['required', 'string', 'regex:/^cs_[A-Za-z0-9]{20,64}$/'],
        ]);

        try {
            $integration = $connect($input['url'], $input['consumer_key'], $input['consumer_secret']);
        } catch (WooStoreTaken) {
            return response()->json([
                'message' => __('errors.integrations.woocommerce_taken'),
                'code' => 'integration.store_taken',
            ], 409);
        } catch (WooRefused $e) {
            throw ValidationException::withMessages([
                $e->field => $e->getMessage(),
            ]);
        }

        $recorder->record(
            action: 'integration.connected',
            subject: $integration,
            context: ['provider' => 'woocommerce', 'store_id' => $integration->external_account_id],
        );

        return (new IntegrationResource($integration))->response()->setStatusCode(201);
    }
}
