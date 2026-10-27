<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Integration;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * A connected store, as a screen may see it.
 *
 * NO TOKENS, and the omission is deliberate twice over: the model hides
 * them, and nothing here asks for them. A resource is where a careless
 * `$this->resource->toArray()` would undo that hiding, so the fields are
 * listed one by one.
 *
 * @mixin Integration
 */
class IntegrationResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'provider' => $this->provider,
            'store_id' => $this->external_account_id,
            'status' => $this->status,

            /*
             * Not the token, but whether it is still good — which is the
             * question the screen is actually asking, and the one an owner
             * can act on.
             */
            'token_expires_at' => $this->token_expires_at?->toIso8601String(),
            'can_refresh' => $this->refresh_token !== null,

            'scopes' => $this->scopes ?? [],
            'last_synced_at' => $this->last_synced_at?->toIso8601String(),
            'last_error' => $this->last_error,
            'connected_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
