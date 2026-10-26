<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Models\Integration;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Keeping a store's access token alive.
 *
 * SALLA'S REFRESH TOKEN IS SINGLE USE, and this is the whole reason the
 * class exists rather than three lines inside the client. Each refresh
 * issues a new refresh token and invalidates the old one, and Salla's
 * documentation is explicit about the consequence of using one twice: it
 * invalidates the access tokens as well, and THE MERCHANT MUST REINSTALL THE
 * APP. There is no recovery an operator can perform. Salla's own
 * documentation recommends a mutex, which is an unusually direct admission.
 *
 * So two jobs refreshing the same store at the same moment do not merely
 * waste a call — they disconnect the shop. The lock is not an optimisation.
 *
 * Three things follow from that, and each is here rather than at a call site
 * where it could be forgotten:
 *
 * - One lock per connection, and the work happens inside it.
 * - The integration is re-read INSIDE the lock. The common case is that the
 *   process which held the lock first already refreshed, and the right thing
 *   to do is nothing at all.
 * - A refusal from Salla is final, not retried. A 4xx on a refresh means the
 *   token is spent or the merchant revoked the app; asking again with the
 *   same dead token is how one bad refresh becomes four.
 */
final class SallaOAuth
{
    /** Long enough for one HTTP call and the write that follows it. */
    private const LOCK_SECONDS = 30;

    /** How long a second caller waits for the first to finish. */
    private const WAIT_SECONDS = 20;

    /**
     * A usable access token for this store, refreshing it if it is due.
     *
     * Every caller that is about to talk to Salla goes through here, so no
     * call site has to remember what a fortnight is.
     */
    public function accessTokenFor(Integration $integration): string
    {
        if ($this->isDue($integration)) {
            $integration = $this->refresh($integration);
        }

        $token = $integration->access_token;

        if (! is_string($token) || $token === '') {
            throw new RuntimeException('This store has no access token; it must be reconnected.');
        }

        return $token;
    }

    /**
     * Exchanges the refresh token for a new pair, under a lock.
     *
     * Returns the integration as it now stands — refreshed by this call, or
     * by whichever process held the lock first.
     */
    public function refresh(Integration $integration): Integration
    {
        $lock = Cache::lock('salla-refresh-'.$integration->getKey(), self::LOCK_SECONDS);

        return $lock->block(self::WAIT_SECONDS, function () use ($integration): Integration {
            /*
             * Re-read inside the lock. If another process refreshed while
             * this one waited, its tokens are the live ones and the pair
             * this process is holding is already spent — using them would be
             * the exact double-use that costs the merchant their install.
             */
            $fresh = $integration->fresh();

            if ($fresh === null) {
                throw new RuntimeException('The connection was removed while its token was being refreshed.');
            }

            if (! $this->isDue($fresh)) {
                return $fresh;
            }

            if (! is_string($fresh->refresh_token) || $fresh->refresh_token === '') {
                /*
                 * No refresh token at all, which means the app was installed
                 * without the `offline_access` scope. Nothing can be done
                 * about it here and the connection is simply over — said
                 * plainly on the row, because the alternative is a merchant
                 * discovering it when their figures stop moving.
                 */
                $this->markDead($fresh, Integration::STATUS_EXPIRED, 'This connection cannot be refreshed. Reconnect the store, and grant offline access.');

                throw new RuntimeException('This store has no refresh token; it must be reconnected.');
            }

            return $this->exchange($fresh);
        });
    }

    private function exchange(Integration $integration): Integration
    {
        $clientId = config('integrations.salla.client_id');
        $clientSecret = config('integrations.salla.client_secret');

        if (! is_string($clientId) || ! is_string($clientSecret) || $clientId === '' || $clientSecret === '') {
            // A deployment problem, not a connection problem: the row is left
            // alone so it recovers the moment the credentials are set.
            throw new RuntimeException('This installation has no Salla app credentials configured.');
        }

        $response = Http::asForm()
            ->timeout(15)
            ->post((string) config('integrations.salla.token_url'), [
                'grant_type' => 'refresh_token',
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'refresh_token' => $integration->refresh_token,
            ]);

        if ($response->clientError()) {
            /*
             * Final. A 4xx here means the refresh token is spent or the
             * merchant revoked the app, and asking again with the same dead
             * token is how one bad refresh becomes four. Salla's own words
             * are kept: an integration that has stopped working is a support
             * conversation, and "it failed" is not a conversation.
             */
            $this->markDead($integration, Integration::STATUS_REVOKED, $this->reasonFrom($response->json(), $response->body()));

            throw new RuntimeException('Salla refused the refresh; the store must be reconnected.');
        }

        if (! $response->successful()) {
            // A 5xx or a timeout: Salla's problem, and worth retrying. The
            // status is left alone so a queue retry finds a live connection.
            throw new RuntimeException('Salla could not be reached to refresh the token.');
        }

        $tokens = SallaTokens::fromPayload((array) $response->json());

        $integration->forceFill($tokens->toAttributes() + [
            'status' => Integration::STATUS_CONNECTED,
            'last_error' => null,
        ])->save();

        return $integration;
    }

    /** Is the token expired, or close enough that it may expire mid-request? */
    private function isDue(Integration $integration): bool
    {
        $expiresAt = $integration->token_expires_at;

        if ($expiresAt === null) {
            return true;
        }

        $margin = (int) config('integrations.salla.refresh_margin_minutes', 5);

        return $expiresAt->isBefore(CarbonImmutable::now()->addMinutes($margin));
    }

    private function markDead(Integration $integration, string $status, string $reason): void
    {
        $integration->forceFill([
            'status' => $status,
            'last_error' => $reason,

            /*
             * The tokens are cleared, not kept "just in case". They are dead
             * by definition here, and a dead key in the database is a key in
             * the database.
             */
            'access_token' => null,
            'refresh_token' => null,
        ])->save();
    }

    /** @param  mixed  $json */
    private function reasonFrom($json, string $body): string
    {
        if (is_array($json)) {
            foreach (['error_description', 'message', 'error'] as $key) {
                if (isset($json[$key]) && is_string($json[$key]) && $json[$key] !== '') {
                    return $json[$key];
                }
            }
        }

        // Truncated: this lands in a column a person reads, not a log.
        return mb_substr(trim($body), 0, 200) ?: 'Salla refused the refresh without saying why.';
    }
}
