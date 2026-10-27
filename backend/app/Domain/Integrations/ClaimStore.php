<?php

declare(strict_types=1);

namespace App\Domain\Integrations;

use App\Models\Integration;
use App\Models\UnclaimedIntegration;
use App\Support\Tenancy\BusinessScope;
use Illuminate\Support\Facades\DB;

/**
 * A business saying "that store is mine".
 *
 * THE WEAK LINK IN THE WHOLE INTEGRATION, and worth being honest about
 * rather than quiet. Salla's Easy mode gives an app no way to tell which of
 * its own accounts an installation belongs to — no state parameter, no
 * redirect back — so the merchant has to say so afterwards, and the only
 * thing they can say is the store id Salla shows them. A store id is not a
 * secret; it is an identifier.
 *
 * What makes that acceptable is the size of the opening rather than the
 * strength of the word:
 *
 * - A store is claimable only while a pending row exists, which is one hour
 *   from the install, not for ever.
 * - It is claimable once. The row is deleted in the same transaction that
 *   creates the connection, so a second claim finds nothing.
 * - The claimer must already be the owner of a business on this
 *   installation, signed in, and the attempt is rate limited and audited.
 * - The store's own name is shown back immediately, so a wrong claim is seen
 *   rather than discovered when a stranger's orders appear on a dashboard —
 *   and disconnecting is one request away.
 *
 * The alternative was matching the merchant's email against the owner's,
 * which reads as stronger and is not: it is an authorisation decision made
 * on an unverified string, and it fails silently for the common case of a
 * merchant whose Salla account uses a different address.
 */
final class ClaimStore
{
    /**
     * The connection is created in the CURRENT business context, which is the
     * signed-in owner's — the same way every other record in this system is
     * written, through `ScopedToBusiness`. It deliberately does not take a
     * business id: a parameter naming whose connection this is would be a
     * second source of truth for the one fact the tenancy layer already
     * guarantees, and the two could disagree.
     *
     * @return Integration|null the new connection, or null if nothing matched
     */
    public function __invoke(string $provider, string $storeId): ?Integration
    {
        return DB::transaction(function () use ($provider, $storeId): ?Integration {
            /*
             * Locked for update: two owners racing to claim the same store —
             * one of them mistakenly — must not both get a connection to it.
             * The loser finds the row gone and is told nothing matched.
             */
            $pending = UnclaimedIntegration::query()
                ->where('provider', $provider)
                ->where('external_account_id', $storeId)
                ->lockForUpdate()
                ->first();

            if ($pending === null || $pending->hasExpired()) {
                return null;
            }

            /*
             * Already connected somewhere. Not "claim it anyway": that would
             * be a way to take over another business's store by naming it,
             * which is the one thing this must never allow.
             */
            $taken = Integration::query()
                ->withoutGlobalScope(BusinessScope::class)
                ->where('provider', $provider)
                ->where('external_account_id', $storeId)
                ->exists();

            if ($taken) {
                return null;
            }

            $integration = Integration::query()->create([
                'provider' => $provider,
                'external_account_id' => $storeId,
                'status' => Integration::STATUS_CONNECTED,
                'access_token' => $pending->access_token,
                'refresh_token' => $pending->refresh_token,
                'token_expires_at' => $pending->token_expires_at,
                'scopes' => $pending->scopes,
            ]);

            // Deleted in the same transaction as the connection is made, so
            // the tokens exist in exactly one place at every moment.
            $pending->delete();

            return $integration;
        });
    }
}
