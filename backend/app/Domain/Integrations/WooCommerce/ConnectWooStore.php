<?php

declare(strict_types=1);

namespace App\Domain\Integrations\WooCommerce;

use App\Jobs\ImportStoreHistory;
use App\Models\Integration;
use App\Support\Http\PublicUrl;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Database\UniqueConstraintViolationException;

/**
 * Connecting a WooCommerce store with a key the owner made in it.
 *
 * The key is tried before anything is saved: a typo is said at once, beside
 * the field, rather than discovered when the first import fails. A store
 * already connected to another business is refused (one store, one set of
 * books), and the year's history is then imported in the background, as
 * for Salla and Zid.
 */
final class ConnectWooStore
{
    public function __construct(private readonly WooClient $client) {}

    /**
     * @throws WooRefused with a message for the owner
     * @throws WooStoreTaken when another business holds this store
     */
    public function __invoke(string $url, string $key, string $secret): Integration
    {
        $normalised = PublicUrl::normalise($url);

        if ($normalised === null) {
            throw new WooRefused('url', __('errors.integrations.woo_bad_url'));
        }

        $store = $this->client->verify($normalised, $key, $secret);

        $owner = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', ImportWooOrder::SOURCE)
            ->where('external_account_id', $normalised)
            ->value('business_id');

        if ($owner !== null && (int) $owner !== CurrentBusiness::get()->id()) {
            throw new WooStoreTaken($normalised);
        }

        $integration = Integration::query()->firstOrNew([
            'provider' => ImportWooOrder::SOURCE,
            'external_account_id' => $normalised,
        ]);

        try {
            $integration->forceFill([
                'access_token' => $key,
                'refresh_token' => $secret,
                'status' => Integration::STATUS_CONNECTED,
                'last_error' => null,
                // A key made in the store does not expire on its own.
                'token_expires_at' => null,
                'scopes' => ['read', 'name:'.$store['name']],
            ])->save();
        } catch (UniqueConstraintViolationException) {
            throw new WooStoreTaken($normalised);
        }

        ImportStoreHistory::dispatch($integration->id, (int) $integration->business_id);

        return $integration;
    }
}
