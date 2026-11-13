<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Authorization\Ability;
use App\Domain\Audit\AuditRecorder;
use App\Http\Controllers\Controller;
use App\Models\ApiKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * The owner's keys for the universal connection: list, make, revoke.
 *
 * Only a role that may manage integrations, as for Salla and Zid. A new key
 * is returned ONCE, in full, in the answer to the request that made it; after
 * that only its prefix is ever shown. Making and revoking are audited.
 */
class ApiKeyController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $this->authorizeManage($request);

        $keys = ApiKey::query()->whereNull('revoked_at')->latest()->get();

        return response()->json(['data' => $keys->map(fn (ApiKey $key): array => $this->present($key))->all()]);
    }

    public function store(Request $request, AuditRecorder $recorder): JsonResponse
    {
        $this->authorizeManage($request);

        $input = $request->validate(['name' => ['required', 'string', 'max:80']]);

        // Twenty live keys is far more systems than a merchant runs; past it,
        // something is making keys in a loop.
        if (ApiKey::query()->whereNull('revoked_at')->count() >= 20) {
            abort(422, __('integrations.api.too_many'));
        }

        [$key, $secret] = ApiKey::issue($input['name'], $request->user()?->id);

        $recorder->record(action: 'integration.api_key_created', subject: $key, context: ['name' => $key->name, 'prefix' => $key->prefix]);

        return response()->json(['data' => $this->present($key) + ['secret' => $secret]], 201);
    }

    public function destroy(Request $request, int $apiKey, AuditRecorder $recorder): JsonResponse
    {
        $this->authorizeManage($request);

        $key = ApiKey::query()->whereNull('revoked_at')->findOrFail($apiKey);
        $key->forceFill(['revoked_at' => now()])->save();

        $recorder->record(action: 'integration.api_key_revoked', subject: $key, context: ['name' => $key->name, 'prefix' => $key->prefix]);

        return response()->json(null, 204);
    }

    /** @return array<string, mixed> */
    private function present(ApiKey $key): array
    {
        return [
            'id' => $key->id,
            'name' => $key->name,
            'prefix' => $key->prefix,
            'last_used_at' => $key->last_used_at?->toIso8601String(),
            'orders_received' => $key->orders_received,
            'created_at' => $key->created_at?->toIso8601String(),
        ];
    }

    private function authorizeManage(Request $request): void
    {
        if (! ($request->user()?->can(Ability::IntegrationsManage->value) ?? false)) {
            abort(403);
        }
    }
}
