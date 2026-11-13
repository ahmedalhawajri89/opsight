<?php

declare(strict_types=1);

namespace App\Domain\Integrations\WooCommerce;

use App\Models\Integration;
use App\Support\Http\PublicUrl;
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

    /**
     * The store's name, checking on the way that the key can read orders.
     *
     * @return array{name: string}
     *
     * @throws WooRefused when the store answers, but not to this key
     */
    public function verify(string $url, string $key, string $secret): array
    {
        $orders = $this->send($url, $key, $secret, 'orders', ['per_page' => 1]);

        if ($orders->status() === 401 || $orders->status() === 403) {
            throw new WooRefused('consumer_key', __('errors.integrations.woo_refused'));
        }

        if (! $orders->successful() || ! is_array($orders->json())) {
            throw new WooRefused('url', __('errors.integrations.woo_not_store', ['status' => $orders->status()]));
        }

        $index = $this->request($url, $key, $secret)->get($url.'/wp-json/');
        $name = is_array($index->json()) ? (string) ($index->json('name') ?? '') : '';

        return ['name' => $name !== '' ? $name : (string) parse_url($url, PHP_URL_HOST)];
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
        $page = 1;

        do {
            $response = $this->send(
                $url,
                (string) $connection->access_token,
                (string) $connection->refresh_token,
                $resource,
                $query + ['per_page' => self::PER_PAGE, 'page' => $page],
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

    /** @param  array<string, mixed>  $query */
    private function send(string $url, string $key, string $secret, string $resource, array $query): Response
    {
        return $this->request($url, $key, $secret)->get("{$url}/wp-json/wc/v3/{$resource}", $query);
    }

    private function request(string $url, string $key, string $secret): PendingRequest
    {
        if (PublicUrl::normalise($url) === null) {
            throw new WooRefused('url', __('errors.integrations.woo_unreachable'));
        }

        $options = PublicUrl::pinnedOptions($url);

        if ($options === null) {
            throw new WooRefused('url', __('errors.integrations.woo_unreachable'));
        }

        return Http::withBasicAuth($key, $secret)
            ->acceptJson()
            ->withUserAgent('Baydar/1.0 (+store connection)')
            ->timeout((int) config('integrations.woocommerce.timeout', 20))
            ->withOptions($options);
    }
}
