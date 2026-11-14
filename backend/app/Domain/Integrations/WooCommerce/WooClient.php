<?php

declare(strict_types=1);

namespace App\Domain\Integrations\WooCommerce;

use App\Models\Integration;
use App\Support\Http\PublicUrl;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * WooCommerce's REST API (v3), read-only, with the key the owner made.
 *
 * The connection row holds the store's URL as `external_account_id`, the
 * consumer key as `access_token` and the consumer secret as `refresh_token`,
 * both encrypted at rest by the model's casts. The key needs Read access only.
 *
 * Every request goes through PublicUrl: the server is fetching an address a
 * user typed, and it must not be able to reach the server's own network.
 */
final class WooClient
{
    public const PER_PAGE = 100;

    public const ROUTE_PRETTY = 'pretty';

    public const ROUTE_QUERY = 'query';

    public const AUTH_HEADER = 'header';

    public const AUTH_QUERY = 'query';

    /**
     * The store's name, and the way this store must be asked, found by
     * asking it: the key is tried before anything is kept.
     *
     * TWO ROUTES. `/wp-json/` needs WordPress's "pretty" permalinks; a site
     * left on plain permalinks answers the same API at `/?rest_route=`, so
     * that is tried when the first does not answer as WordPress.
     *
     * TWO WAYS TO SEND THE KEY. In a header (Basic auth), or, where a host's
     * server strips that header before WordPress sees it (common on shared
     * hosting), as query parameters, which WooCommerce documents for HTTPS.
     * The header is tried first: a key in an address can land in the
     * store's own access logs.
     *
     * @return array{name: string, route: string, auth: string}
     *
     * @throws WooRefused with what the owner can do about it
     */
    public function verify(string $url, string $key, string $secret): array
    {
        $blocked = false;
        $status = 0;

        foreach ([self::ROUTE_PRETTY, self::ROUTE_QUERY] as $route) {
            $response = $this->attempt($url, $key, $secret, $route, self::AUTH_HEADER);

            if (self::isList($response)) {
                return ['name' => $this->name($url, $key, $secret, $route, self::AUTH_HEADER), 'route' => $route, 'auth' => self::AUTH_HEADER];
            }

            $code = self::wordPressError($response);

            // WordPress answered and refused: the key, or the header that carried it.
            if ($code !== null && in_array($response->status(), [401, 403], true)) {
                $retry = $this->attempt($url, $key, $secret, $route, self::AUTH_QUERY);

                if (self::isList($retry)) {
                    return ['name' => $this->name($url, $key, $secret, $route, self::AUTH_QUERY), 'route' => $route, 'auth' => self::AUTH_QUERY];
                }

                throw new WooRefused('consumer_key', __('errors.integrations.woo_refused'));
            }

            // WordPress answered, but has no WooCommerce API at all.
            if ($code === 'rest_no_route') {
                throw new WooRefused('url', __('errors.integrations.woo_no_woocommerce'));
            }

            // Something in front of WordPress said no, in its own words.
            if ($code === null && in_array($response->status(), [403, 406, 429, 503], true)) {
                $blocked = true;
            }

            $status = $response->status();
        }

        if ($blocked) {
            throw new WooRefused('url', __('errors.integrations.woo_blocked'));
        }

        throw new WooRefused('url', __('errors.integrations.woo_not_store', ['status' => $status]));
    }

    /** @return iterable<array<string, mixed>> */
    public function products(Integration $connection): iterable
    {
        return $this->pages($connection, 'products', ['status' => 'any']);
    }

    /**
     * Orders placed between two days, inclusive.
     *
     * @return iterable<array<string, mixed>>
     */
    public function orders(Integration $connection, string $from, string $to): iterable
    {
        return $this->pages($connection, 'orders', [
            'after' => $from.'T00:00:00',
            'before' => $to.'T23:59:59',
            'orderby' => 'date',
            'order' => 'asc',
        ]);
    }

    /**
     * Orders changed since a moment, however long ago they were placed: a
     * refund or a cancellation today of last month's order.
     *
     * @return iterable<array<string, mixed>>
     */
    public function ordersChangedSince(Integration $connection, string $since): iterable
    {
        return $this->pages($connection, 'orders', [
            'modified_after' => $since,
            'orderby' => 'modified',
            'order' => 'asc',
        ]);
    }

    /**
     * @param  array<string, mixed>  $query
     * @return iterable<array<string, mixed>>
     */
    private function pages(Integration $connection, string $resource, array $query): iterable
    {
        $url = (string) $connection->external_account_id;
        [$route, $auth] = self::wayOf($connection);
        $page = 1;

        do {
            $response = $this->send(
                $url,
                (string) $connection->access_token,
                (string) $connection->refresh_token,
                $resource,
                $query + ['per_page' => self::PER_PAGE, 'page' => $page],
                $route,
                $auth,
            );

            if (! $response->successful()) {
                throw new RuntimeException("WooCommerce answered {$response->status()} for {$resource}, page {$page}.");
            }

            $rows = $response->json();

            foreach (is_array($rows) ? $rows : [] as $row) {
                if (is_array($row)) {
                    yield $row;
                }
            }

            $last = (int) ($response->header('X-WP-TotalPages') ?: $page);
            $page++;
        } while ($page <= $last && is_array($rows) && $rows !== []);
    }

    /**
     * The way a connection was found to work when it was made (verify),
     * kept among its scopes. A connection made before this was recorded
     * used the pretty route and the header.
     *
     * @return array{0: string, 1: string}
     */
    public static function wayOf(Integration $connection): array
    {
        $scopes = (array) ($connection->scopes ?? []);

        return [
            in_array('rest:'.self::ROUTE_QUERY, $scopes, true) ? self::ROUTE_QUERY : self::ROUTE_PRETTY,
            in_array('auth:'.self::AUTH_QUERY, $scopes, true) ? self::AUTH_QUERY : self::AUTH_HEADER,
        ];
    }

    /** One try at the orders list, for verify: a store that says nothing at all is unreachable. */
    private function attempt(string $url, string $key, string $secret, string $route, string $auth): Response
    {
        try {
            return $this->send($url, $key, $secret, 'orders', ['per_page' => 1], $route, $auth);
        } catch (ConnectionException) {
            // A wrong address, a site that is down, or a certificate the
            // server will not trust.
            throw new WooRefused('url', __('errors.integrations.woo_unreachable'));
        }
    }

    private function name(string $url, string $key, string $secret, string $route, string $auth): string
    {
        try {
            $index = $this->send($url, $key, $secret, '', [], $route, $auth, root: true);
            $name = is_array($index->json()) ? (string) ($index->json('name') ?? '') : '';
        } catch (ConnectionException) {
            $name = '';
        }

        return $name !== '' ? $name : (string) parse_url($url, PHP_URL_HOST);
    }

    private static function isList(Response $response): bool
    {
        $rows = $response->successful() ? $response->json() : null;

        return is_array($rows) && array_is_list($rows);
    }

    /** WordPress's own error code, when the answer is one: proof WordPress itself answered. */
    private static function wordPressError(Response $response): ?string
    {
        $body = $response->json();

        return is_array($body) && is_string($body['code'] ?? null) ? $body['code'] : null;
    }

    /**
     * @param  array<string, mixed>  $query
     *
     * @throws ConnectionException without the address, which may hold the key
     */
    private function send(
        string $url,
        string $key,
        string $secret,
        string $resource,
        array $query,
        string $route = self::ROUTE_PRETTY,
        string $auth = self::AUTH_HEADER,
        bool $root = false,
    ): Response {
        $path = $root ? '/' : "/wc/v3/{$resource}";
        $request = $this->request($url, $key, $secret, $auth);

        if ($auth === self::AUTH_QUERY) {
            $query += ['consumer_key' => $key, 'consumer_secret' => $secret];
        }

        try {
            return $route === self::ROUTE_QUERY
                ? $request->get("{$url}/", ['rest_route' => $path] + $query)
                : $request->get("{$url}/wp-json{$path}", $query);
        } catch (ConnectionException) {
            // Guzzle's message carries the full address, and with it a key
            // sent as a query parameter; it would reach the log and the page.
            throw new ConnectionException('WooCommerce did not answer.');
        }
    }

    private function request(string $url, string $key, string $secret, string $auth): PendingRequest
    {
        if (PublicUrl::normalise($url) === null) {
            throw new WooRefused('url', __('errors.integrations.woo_unreachable'));
        }

        $options = PublicUrl::pinnedOptions($url);

        if ($options === null) {
            throw new WooRefused('url', __('errors.integrations.woo_unreachable'));
        }

        $request = $auth === self::AUTH_HEADER ? Http::withBasicAuth($key, $secret) : Http::withOptions([]);

        return $request
            ->acceptJson()
            ->withUserAgent('Baydar/1.0 (+store connection)')
            ->timeout((int) config('integrations.woocommerce.timeout', 20))
            ->withOptions($options);
    }
}
