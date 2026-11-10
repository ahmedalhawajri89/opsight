<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use App\Models\Integration;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Connecting a Zid store and keeping it connected.
 *
 * A STANDARD AUTHORIZATION-CODE FLOW, which is the one thing Zid makes
 * easier than Salla. Salla's Easy mode hands over a store's tokens with no
 * way to tell whose they are, so the owner must claim the store afterwards
 * by its id (ClaimStore). Zid returns our own `state` to the callback, so
 * the store is tied to the signed-in business at the moment it connects and
 * nothing has to be claimed.
 *
 * REFRESH ROTATES THE TOKEN. Zid's documentation: "A refresh returns a new
 * refresh_token, and revokes the old one." Two processes refreshing the same
 * store at once would leave one of them holding a dead token, so the same
 * lock-and-re-read discipline as SallaOAuth applies.
 */
final class ZidOAuth
{
    private const LOCK_SECONDS = 30;

    private const WAIT_SECONDS = 20;

    /**
     * Refresh this long before the refresh token itself would die. Zid's own
     * advice is roughly every ten months on a twelve-month token.
     */
    private const REFRESH_TOKEN_MARGIN_DAYS = 60;

    /** And this long before the access tokens would. */
    private const ACCESS_TOKEN_MARGIN_DAYS = 7;

    /** Where to send the owner's browser to authorise the app. */
    public function authorizeUrl(string $state): string
    {
        return rtrim($this->config('oauth_base'), '/').'/oauth/authorize?'.http_build_query([
            'client_id' => $this->config('client_id'),
            'redirect_uri' => $this->config('redirect_uri'),
            'response_type' => 'code',
            'state' => $state,
        ]);
    }

    /** Trades the one-use code from the callback for a store's tokens. */
    public function exchange(string $code): ZidTokens
    {
        return ZidTokens::fromPayload($this->tokenRequest([
            'grant_type' => 'authorization_code',
            'code' => $code,
        ]));
    }

    /**
     * Both credentials for a call, refreshed first if they are due.
     *
     * @return array{authorization: string, manager: string}
     */
    public function credentialsFor(Integration $integration): array
    {
        if ($this->isDue($integration)) {
            $integration = $this->refresh($integration);
        }

        $authorization = $integration->authorization_token;
        $manager = $integration->access_token;

        if (! is_string($authorization) || $authorization === '' || ! is_string($manager) || $manager === '') {
            throw new RuntimeException('This Zid store has no usable tokens; it must be reconnected.');
        }

        return ['authorization' => $authorization, 'manager' => $manager];
    }

    public function refresh(Integration $integration): Integration
    {
        $lock = Cache::lock('zid-refresh-'.$integration->getKey(), self::LOCK_SECONDS);

        return $lock->block(self::WAIT_SECONDS, function () use ($integration): Integration {
            // Re-read inside the lock: whoever held it first may already have
            // refreshed, and the token this process holds is then spent.
            $fresh = $integration->fresh();

            if ($fresh === null) {
                throw new RuntimeException('The connection was removed while its token was being refreshed.');
            }

            if (! $this->isDue($fresh)) {
                return $fresh;
            }

            if (! is_string($fresh->refresh_token) || $fresh->refresh_token === '') {
                $this->markDead($fresh, Integration::STATUS_EXPIRED, 'This connection cannot be renewed. Connect the store again.');

                throw new RuntimeException('This Zid store has no refresh token; it must be reconnected.');
            }

            try {
                $tokens = ZidTokens::fromPayload($this->tokenRequest([
                    'grant_type' => 'refresh_token',
                    'refresh_token' => $fresh->refresh_token,
                ]));
            } catch (ZidRefused $refused) {
                // Final: the token is spent or the merchant removed the app.
                $this->markDead($fresh, Integration::STATUS_REVOKED, $refused->getMessage());

                throw $refused;
            }

            /*
             * The whole set at once. Zid revokes the old refresh token the
             * moment it issues the new one, so keeping any part of the old
             * set is a connection that fails on its next refresh.
             */
            $fresh->forceFill($tokens->toAttributes() + [
                'status' => Integration::STATUS_CONNECTED,
                'last_error' => null,
            ])->save();

            return $fresh;
        });
    }

    private function isDue(Integration $integration): bool
    {
        $now = CarbonImmutable::now();

        if ($integration->token_expires_at === null
            || $integration->token_expires_at->isBefore($now->addDays(self::ACCESS_TOKEN_MARGIN_DAYS))) {
            return true;
        }

        return $integration->refresh_token_expires_at !== null
            && $integration->refresh_token_expires_at->isBefore($now->addDays(self::REFRESH_TOKEN_MARGIN_DAYS));
    }

    /**
     * @param  array<string, string>  $fields
     * @return array<string, mixed>
     */
    private function tokenRequest(array $fields): array
    {
        $clientId = $this->config('client_id');
        $clientSecret = $this->config('client_secret');

        if ($clientId === '' || $clientSecret === '') {
            throw new RuntimeException('This installation has no Zid app credentials configured.');
        }

        // In the body, not the query string: Zid's documentation is explicit,
        // and a secret in a URL ends up in every proxy's access log.
        $response = Http::asForm()
            ->acceptJson()
            ->timeout(15)
            ->post(rtrim($this->config('oauth_base'), '/').'/oauth/token', $fields + [
                'client_id' => $clientId,
                'client_secret' => $clientSecret,
                'redirect_uri' => $this->config('redirect_uri'),
            ]);

        if ($response->clientError()) {
            throw new ZidRefused($this->reasonFrom($response->json(), $response->body()));
        }

        if (! $response->successful()) {
            throw new RuntimeException('Zid could not be reached to issue a token.');
        }

        return (array) $response->json();
    }

    private function markDead(Integration $integration, string $status, string $reason): void
    {
        $integration->forceFill([
            'status' => $status,
            'last_error' => $reason,
            'access_token' => null,
            'authorization_token' => null,
            'refresh_token' => null,
        ])->save();
    }

    private function reasonFrom(mixed $json, string $body): string
    {
        if (is_array($json)) {
            foreach (['error_description', 'message', 'error'] as $key) {
                if (isset($json[$key]) && is_string($json[$key]) && $json[$key] !== '') {
                    return $json[$key];
                }
            }
        }

        return mb_substr(trim($body), 0, 200) ?: 'Zid refused without saying why.';
    }

    private function config(string $key): string
    {
        $value = config("integrations.zid.{$key}");

        return is_string($value) ? $value : '';
    }
}
