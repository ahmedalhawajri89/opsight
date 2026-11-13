<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Integrations\Api\InboundOrder;
use App\Domain\Integrations\Import\RecordImportedOrder;
use App\Http\Controllers\Controller;
use App\Models\ApiKey;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

/**
 * The universal connection's door: any system sends an order here with its
 * key, and it is recorded as Salla's and Zid's are.
 *
 *   POST /api/v1/inbound/orders
 *   Authorization: Bearer bydr_xxxxxxxx_...
 *
 * NO SESSION, AND NO BUSINESS IN THE BODY. The business is the key's, and
 * only the key's: a sender cannot name another business, so a leaked key
 * reaches one business and is revoked from its own screen.
 *
 * Sending the same `id` again updates that order rather than adding a second
 * one (RecordImportedOrder is idempotent on source and external id), so a
 * sender that retries after a timeout cannot double the figures.
 *
 * Errors answer in one shape for machines: 401 for a missing, unknown or
 * revoked key (always the same words, so the endpoint does not confirm
 * which), 422 with field errors for a payload that cannot be read.
 */
class InboundOrderController extends Controller
{
    public function store(Request $request, RecordImportedOrder $record): JsonResponse
    {
        $key = ApiKey::findLive((string) $request->bearerToken());

        if ($key === null) {
            return response()->json(['message' => __('integrations.api.unauthorised')], 401);
        }

        $data = Validator::make($request->all(), InboundOrder::rules())->validate();

        return CurrentBusiness::get()->run($key->business_id, function () use ($key, $data, $record): JsonResponse {
            $order = $record(InboundOrder::toImported($data, $key->name));
            $created = $order->wasRecentlyCreated;

            $key->newQuery()->whereKey($key->id)->update([
                'last_used_at' => now(),
                'orders_received' => $key->orders_received + ($created ? 1 : 0),
            ]);

            return response()->json([
                'data' => [
                    'id' => (string) $data['id'],
                    'reference' => $order->reference,
                    'status' => $order->status->value,
                    'total' => (string) $order->total_amount,
                    'created' => $created,
                ],
            ], $created ? 201 : 200);
        });
    }
}
