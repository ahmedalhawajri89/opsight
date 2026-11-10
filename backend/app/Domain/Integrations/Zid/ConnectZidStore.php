<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use App\Domain\Integrations\WebhookProviders;
use App\Jobs\ImportStoreHistory;
use App\Models\Integration;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Throwable;

/**
 * An owner connecting their Zid store, start to finish (ADR-037).
 *
 * WHY THIS IS STRONGER THAN CLAIMING A SALLA STORE. ClaimStore has to trust a
 * store id the owner types, because Salla's Easy mode gives no way to know
 * whose installation it was. Here the owner starts the flow from inside
 * Baydar, signed in, and Zid hands back the `state` we gave it. The store is
 * bound to the business that asked for it, and nobody can name someone
 * else's store into theirs.
 *
 * The state is one use and short-lived, and it is checked against the user
 * as well as the business: a state that leaked from one owner's browser is
 * useless in another's session.
 */
final class ConnectZidStore
{
    /** Zid's own code lasts ten minutes; a state need not outlive it. */
    private const STATE_MINUTES = 10;

    public function __construct(
        private readonly ZidOAuth $oauth,
        private readonly ZidClient $client,
        private readonly WebhookProviders $providers,
    ) {}

    /** Where to send the owner. Runs in their business, signed in. */
    public function begin(int $userId): string
    {
        $state = Str::random(48);

        Cache::put($this->key($state), [
            'business_id' => CurrentBusiness::get()->id(),
            'user_id' => $userId,
        ], now()->addMinutes(self::STATE_MINUTES));

        return $this->oauth->authorizeUrl($state);
    }

    /**
     * Finishes the flow from Zid's callback.
     *
     * Returns null for every way the request is not genuinely this owner's —
     * an unknown, expired, reused or foreign state — so the caller answers
     * them all the same way and reveals nothing about which it was. Throws
     * ZidStoreTaken when the store is already another business's.
     */
    public function complete(string $code, string $state, int $userId): ?Integration
    {
        // pull, not get: a state is spent the moment anyone presents it.
        $expected = Cache::pull($this->key($state));

        if (! is_array($expected)
            || ($expected['user_id'] ?? null) !== $userId
            || ($expected['business_id'] ?? null) !== CurrentBusiness::get()->id()) {
            return null;
        }

        $tokens = $this->oauth->exchange($code);
        $store = $this->client->profile($tokens);

        $owner = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', ZidWebhooks::PROVIDER)
            ->where('external_account_id', $store['id'])
            ->value('business_id');

        if ($owner !== null && (int) $owner !== CurrentBusiness::get()->id()) {
            /*
             * Not "connect it anyway". One store feeding two businesses would
             * be one merchant's orders appearing in a stranger's figures, and
             * the store's owner would have no way to see it happening.
             */
            throw new ZidStoreTaken($store['id']);
        }

        /*
         * Reconnecting a store already here replaces its tokens in place,
         * keeping its history and its id.
         */
        $integration = Integration::query()->firstOrNew([
            'provider' => ZidWebhooks::PROVIDER,
            'external_account_id' => $store['id'],
        ]);

        $integration->forceFill($tokens->toAttributes() + [
            'status' => Integration::STATUS_CONNECTED,
            'last_error' => null,
        ])->save();

        $this->subscribe($integration);

        ImportStoreHistory::dispatch($integration->id, (int) $integration->business_id);

        return $integration;
    }

    /**
     * Asks Zid to deliver this store's events here.
     *
     * Skipped without a secret, because the door answers 404 to a provider
     * with none and every delivery would be lost. A failure does not undo the
     * connection: the history still imports, and the reason is written where
     * the owner and support can read it.
     */
    private function subscribe(Integration $integration): void
    {
        $secret = $this->providers->secretFor(ZidWebhooks::PROVIDER);

        if ($secret === null) {
            return;
        }

        $target = (string) (config('integrations.zid.webhook_url') ?: route('webhooks.receive', ['provider' => ZidWebhooks::PROVIDER]));

        try {
            foreach (ZidWebhooks::EVENTS as $event) {
                $this->client->subscribe($integration, $event, $target, ZidWebhooks::USERNAME, $secret);
            }
        } catch (Throwable $e) {
            report($e);

            $integration->forceFill([
                'last_error' => 'Connected, but Zid would not send live updates: '.$e->getMessage(),
            ])->save();
        }
    }

    private function key(string $state): string
    {
        return 'zid-oauth:'.hash('sha256', $state);
    }
}
