<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Shopify;

use App\Jobs\ImportStoreHistory;
use App\Models\Integration;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Connecting a Shopify store, two ways.
 *
 *  1. BAYDAR'S OWN APP (OAuth). The owner types the shop's name, approves
 *     Baydar in Shopify and comes back. Needs the app Baydar registers with
 *     Shopify (config integrations.shopify); until then the screen says so.
 *     The way in for most merchants: since 1 January 2026 a merchant cannot
 *     make a new custom app in their own admin.
 *
 *  2. A TOKEN THE OWNER ALREADY HAS (shpat_...), from a custom app made in
 *     their admin before that date. Those keep working, and the owner pastes
 *     the Admin API token.
 *
 * Either way the token is tried before it is kept, one shop belongs to one
 * business, and the year's history is imported in the background.
 */
final class ConnectShopifyStore
{
    private const STATE_MINUTES = 10;

    public function __construct(private readonly ShopifyClient $client) {}

    /** @throws ShopifyRefused|ShopifyStoreTaken */
    public function withToken(string $shop, string $token): Integration
    {
        $domain = ShopifyDomain::normalise($shop);

        if ($domain === null) {
            throw new ShopifyRefused('shop', __('errors.integrations.shopify_bad_shop'));
        }

        $store = $this->client->verify($domain, $token);

        return $this->keep($domain, $token, null, $store['name']);
    }

    /** Where to send the browser to approve Baydar, for this user, this business. */
    public function begin(string $shop, int $userId): string
    {
        $domain = ShopifyDomain::normalise($shop);

        if ($domain === null) {
            throw new ShopifyRefused('shop', __('errors.integrations.shopify_bad_shop'));
        }

        $state = Str::random(48);

        Cache::put($this->key($state), [
            'business_id' => CurrentBusiness::get()->id(),
            'user_id' => $userId,
            'shop' => $domain,
        ], now()->addMinutes(self::STATE_MINUTES));

        return "https://{$domain}/admin/oauth/authorize?".http_build_query([
            'client_id' => config('integrations.shopify.client_id'),
            'scope' => config('integrations.shopify.scopes', 'read_orders,read_products'),
            'redirect_uri' => config('integrations.shopify.redirect_uri'),
            'state' => $state,
        ]);
    }

    /**
     * Shopify's answer, as the browser brought it back. Null when the state
     * is not one this user started in this business, or the shop differs.
     *
     * @param  array<string, string>  $query  every parameter Shopify sent
     *
     * @throws ShopifyRefused|ShopifyStoreTaken
     */
    public function complete(array $query, int $userId): ?Integration
    {
        if (! self::signed($query, (string) config('integrations.shopify.client_secret'))) {
            throw new ShopifyRefused('shop', __('errors.integrations.shopify_signature'));
        }

        $expected = Cache::pull($this->key((string) ($query['state'] ?? '')));
        $domain = ShopifyDomain::normalise((string) ($query['shop'] ?? ''));

        if (! is_array($expected)
            || ($expected['user_id'] ?? null) !== $userId
            || ($expected['business_id'] ?? null) !== CurrentBusiness::get()->id()
            || $domain === null
            || ($expected['shop'] ?? null) !== $domain) {
            return null;
        }

        $response = Http::asForm()->acceptJson()->timeout(20)
            ->withOptions(['allow_redirects' => false])
            ->post("https://{$domain}/admin/oauth/access_token", [
                'client_id' => config('integrations.shopify.client_id'),
                'client_secret' => config('integrations.shopify.client_secret'),
                'code' => (string) ($query['code'] ?? ''),
            ]);

        $token = $response->json('access_token');

        if (! $response->successful() || ! is_string($token) || $token === '') {
            throw new ShopifyRefused('shop', __('errors.integrations.shopify_refused'));
        }

        $scopes = (string) ($response->json('scope') ?? '');

        return $this->keep($domain, $token, $scopes);
    }

    /**
     * Shopify signs the parameters it sends back with the app's secret. The
     * `hmac` is SHA-256 over the others, sorted and joined as a query string.
     *
     * @param  array<string, string>  $query
     */
    public static function signed(array $query, string $secret): bool
    {
        $hmac = (string) ($query['hmac'] ?? '');

        if ($hmac === '' || $secret === '') {
            return false;
        }

        $rest = $query;
        unset($rest['hmac'], $rest['signature']);
        ksort($rest);

        $message = http_build_query($rest, '', '&', PHP_QUERY_RFC3986);

        return hash_equals(hash_hmac('sha256', urldecode($message), $secret), strtolower($hmac));
    }

    private function keep(string $domain, string $token, ?string $scopes, ?string $name = null): Integration
    {
        $owner = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', ImportShopifyOrder::SOURCE)
            ->where('external_account_id', $domain)
            ->value('business_id');

        if ($owner !== null && (int) $owner !== CurrentBusiness::get()->id()) {
            throw new ShopifyStoreTaken($domain);
        }

        $integration = Integration::query()->firstOrNew([
            'provider' => ImportShopifyOrder::SOURCE,
            'external_account_id' => $domain,
        ]);

        try {
            $integration->forceFill([
                'access_token' => $token,
                'status' => Integration::STATUS_CONNECTED,
                'last_error' => null,
                // An offline Admin API token does not expire on its own.
                'token_expires_at' => null,
                'scopes' => [
                    ...($scopes !== null ? array_values(array_filter(explode(',', $scopes))) : ['read_orders', 'read_products']),
                    // The shop's own name, to tell one store from another on the page.
                    ...($name !== null && $name !== '' ? ['name:'.$name] : []),
                ],
            ])->save();
        } catch (UniqueConstraintViolationException) {
            throw new ShopifyStoreTaken($domain);
        }

        ImportStoreHistory::dispatch($integration->id, (int) $integration->business_id);

        return $integration;
    }

    private function key(string $state): string
    {
        return 'shopify-oauth:'.hash('sha256', $state);
    }
}
