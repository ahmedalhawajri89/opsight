<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Audit\AuditRecorder;
use App\Domain\Integrations\Shopify\ConnectShopifyStore;
use App\Domain\Integrations\Shopify\ShopifyRefused;
use App\Domain\Integrations\Shopify\ShopifyStoreTaken;
use App\Http\Controllers\Controller;
use App\Http\Resources\IntegrationResource;
use App\Models\Integration;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Connecting a Shopify store (2026-11-13): through Baydar's own app, or with
 * an Admin API token the owner already has. ConnectShopifyStore explains why
 * both exist. The token is never echoed back, logged or audited.
 */
class ShopifyConnectionController extends Controller
{
    /** With a token from a custom app the owner made before 2026. */
    public function token(Request $request, ConnectShopifyStore $connect, AuditRecorder $recorder): JsonResponse
    {
        $this->authorize('create', Integration::class);

        $input = $request->validate([
            'shop' => ['required', 'string', 'max:190'],
            'token' => ['required', 'string', 'regex:/^shpat_[A-Za-z0-9]{20,80}$/'],
        ]);

        return $this->answer(fn (): Integration => $connect->withToken($input['shop'], $input['token']), $recorder);
    }

    public function authorizeUrl(Request $request, ConnectShopifyStore $connect): JsonResponse
    {
        $this->authorize('create', Integration::class);

        if (! self::configured()) {
            return response()->json([
                'message' => __('errors.integrations.shopify_unavailable'),
                'code' => 'integration.unavailable',
            ], 503);
        }

        $input = $request->validate(['shop' => ['required', 'string', 'max:190']]);

        try {
            $url = $connect->begin($input['shop'], (int) $request->user()?->getKey());
        } catch (ShopifyRefused $e) {
            throw ValidationException::withMessages([$e->field => $e->getMessage()]);
        }

        return response()->json(['data' => ['url' => $url]]);
    }

    /** Every parameter Shopify sent the browser back with, signature included. */
    public function callback(Request $request, ConnectShopifyStore $connect, AuditRecorder $recorder): JsonResponse
    {
        $this->authorize('create', Integration::class);

        $query = $request->validate([
            'code' => ['required', 'string', 'max:512'],
            'state' => ['required', 'string', 'max:128'],
            'shop' => ['required', 'string', 'max:190'],
            'hmac' => ['required', 'string', 'max:128'],
            'timestamp' => ['required', 'string', 'max:32'],
            'host' => ['sometimes', 'string', 'max:512'],
        ]);

        return $this->answer(function () use ($connect, $query, $request): Integration {
            $integration = $connect->complete(array_map('strval', $query), (int) $request->user()?->getKey());

            if ($integration === null) {
                throw ValidationException::withMessages(['state' => __('errors.integrations.shopify_state')]);
            }

            return $integration;
        }, $recorder);
    }

    public static function configured(): bool
    {
        return filled(config('integrations.shopify.client_id'))
            && filled(config('integrations.shopify.client_secret'))
            && filled(config('integrations.shopify.redirect_uri'));
    }

    /** @param  callable(): Integration  $connect */
    private function answer(callable $connect, AuditRecorder $recorder): JsonResponse
    {
        try {
            $integration = $connect();
        } catch (ShopifyStoreTaken $taken) {
            $recorder->record(
                action: 'integration.connect_refused',
                context: ['provider' => 'shopify', 'store_id' => $taken->shop, 'reason' => 'taken'],
            );

            return response()->json([
                'message' => __('errors.integrations.shopify_taken'),
                'code' => 'integration.taken',
            ], 409);
        } catch (ShopifyRefused $e) {
            throw ValidationException::withMessages([$e->field => $e->getMessage()]);
        }

        $recorder->record(
            action: 'integration.connected',
            subject: $integration,
            context: ['provider' => 'shopify', 'store_id' => $integration->external_account_id],
        );

        return (new IntegrationResource($integration))->response()->setStatusCode(201);
    }
}
