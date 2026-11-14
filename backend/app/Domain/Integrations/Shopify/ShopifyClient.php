<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Shopify;

use App\Models\Integration;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Shopify's Admin API, over GraphQL: Shopify requires it of new apps, and
 * the REST Admin API is legacy.
 *
 * The connection row holds the shop's `name.myshopify.com` domain as
 * `external_account_id` and the Admin API access token as `access_token`
 * (encrypted by the model's casts). The server only ever talks to a
 * `*.myshopify.com` host (ShopifyDomain), so no address a user typed can
 * point it at its own network.
 *
 * CUSTOMERS ARE NOT READ. Shopify treats a buyer's name, email and phone as
 * protected customer data, which an app may read only after Shopify approves
 * it for that; asking without approval fails the whole query. Orders are
 * therefore recorded without a customer until that approval exists.
 */
final class ShopifyClient
{
    private const PAGE = 50;

    private const ORDER_FIELDS = <<<'GQL'
        id
        legacyResourceId
        name
        createdAt
        cancelledAt
        taxesIncluded
        displayFinancialStatus
        displayFulfillmentStatus
        subtotalPriceSet { shopMoney { amount } }
        totalDiscountsSet { shopMoney { amount } }
        totalShippingPriceSet { shopMoney { amount } }
        totalTaxSet { shopMoney { amount } }
        totalPriceSet { shopMoney { amount } }
        totalOutstandingSet { shopMoney { amount } }
        paymentGatewayNames
        lineItems(first: 250) {
          nodes {
            sku
            name
            quantity
            originalUnitPriceSet { shopMoney { amount } }
            variant { legacyResourceId }
          }
        }
        GQL;

    /**
     * The shop's name, checking on the way that the token works.
     *
     * @return array{name: string, domain: string}
     *
     * @throws ShopifyRefused
     */
    public function verify(string $shop, string $token): array
    {
        $data = $this->query($shop, $token, '{ shop { name myshopifyDomain } }');

        return [
            'name' => (string) ($data['shop']['name'] ?? $shop),
            'domain' => (string) ($data['shop']['myshopifyDomain'] ?? $shop),
        ];
    }

    /** @return iterable<array<string, mixed>> */
    public function products(Integration $connection): iterable
    {
        $query = <<<'GQL'
            query ($after: String) {
              productVariants(first: 100, after: $after) {
                pageInfo { hasNextPage endCursor }
                nodes {
                  legacyResourceId
                  sku
                  title
                  price
                  product { title status }
                }
              }
            }
            GQL;

        return $this->pages($connection, $query, 'productVariants', []);
    }

    /** @return iterable<array<string, mixed>> */
    public function orders(Integration $connection, string $from, string $to): iterable
    {
        return $this->orderPages($connection, "created_at:>='{$from}T00:00:00Z' AND created_at:<='{$to}T23:59:59Z'", 'CREATED_AT');
    }

    /** @return iterable<array<string, mixed>> */
    public function ordersChangedSince(Integration $connection, string $since): iterable
    {
        return $this->orderPages($connection, "updated_at:>='{$since}Z'", 'UPDATED_AT');
    }

    /** @return iterable<array<string, mixed>> */
    private function orderPages(Integration $connection, string $search, string $sortKey): iterable
    {
        $fields = self::ORDER_FIELDS;
        $page = self::PAGE;
        $query = <<<GQL
            query (\$after: String, \$search: String) {
              orders(first: {$page}, after: \$after, query: \$search, sortKey: {$sortKey}) {
                pageInfo { hasNextPage endCursor }
                nodes { {$fields} }
              }
            }
            GQL;

        return $this->pages($connection, $query, 'orders', ['search' => $search]);
    }

    /**
     * @param  array<string, mixed>  $variables
     * @return iterable<array<string, mixed>>
     */
    private function pages(Integration $connection, string $query, string $root, array $variables): iterable
    {
        $after = null;

        do {
            $data = $this->query(
                (string) $connection->external_account_id,
                (string) $connection->access_token,
                $query,
                $variables + ['after' => $after],
            );

            foreach ((array) ($data[$root]['nodes'] ?? []) as $node) {
                if (is_array($node)) {
                    yield $node;
                }
            }

            $info = $data[$root]['pageInfo'] ?? [];
            $after = ($info['hasNextPage'] ?? false) ? ($info['endCursor'] ?? null) : null;
        } while ($after !== null);
    }

    /**
     * @param  array<string, mixed>  $variables
     * @return array<string, mixed>
     */
    private function query(string $shop, string $token, string $query, array $variables = []): array
    {
        if (ShopifyDomain::normalise($shop) === null) {
            throw new ShopifyRefused('shop', __('errors.integrations.shopify_bad_shop'));
        }

        $version = (string) config('integrations.shopify.api_version', '2026-10');

        try {
            $response = Http::withHeaders(['X-Shopify-Access-Token' => $token])
                ->acceptJson()
                ->timeout(30)
                ->withOptions(['allow_redirects' => false])
                ->post("https://{$shop}/admin/api/{$version}/graphql.json", [
                    'query' => $query,
                    'variables' => (object) $variables,
                ]);
        } catch (ConnectionException) {
            throw new ShopifyRefused('shop', __('errors.integrations.shopify_unreachable'));
        }

        if ($response->status() === 401 || $response->status() === 403) {
            throw new ShopifyRefused('token', __('errors.integrations.shopify_refused'));
        }

        // No such shop (404), or a shop closed, frozen or unpaid (402, 423):
        // the owner can act on that, so it is said beside the shop's name.
        if (in_array($response->status(), [402, 404, 423], true)) {
            throw new ShopifyRefused('shop', __('errors.integrations.shopify_unreachable'));
        }

        /*
         * Shopify retires each API version about a year after it ships and
         * then quietly answers with the oldest one it still serves. Said in
         * the log, so the version in config/integrations.php is raised before
         * a field changes under the importer.
         */
        $served = $response->header('X-Shopify-API-Version');

        if ($served !== '' && $served !== $version) {
            Log::warning('Shopify served API version '.$served.' instead of '.$version.'; raise SHOPIFY_API_VERSION.');
        }

        if (! $response->successful()) {
            throw new RuntimeException("Shopify answered {$response->status()}.");
        }

        if (! empty($response->json('errors'))) {
            throw new RuntimeException('Shopify refused the query: '.json_encode($response->json('errors')));
        }

        return (array) $response->json('data', []);
    }
}
