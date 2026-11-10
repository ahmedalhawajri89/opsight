<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use App\Models\Integration;
use Generator;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talking to Zid's API as one connected store.
 *
 * WHAT HAS NOT BEEN SEEN WORKING. Every path, header and field here is
 * taken from Zid's published documentation, and none of it has met a live
 * store yet, because no Zid partner app exists for this installation. Three
 * things in that documentation are uncertain enough to name, so the first
 * live run has one place to correct rather than a search to run:
 *
 * - THE HEADERS. The orders and profile endpoints ask for `Authorization`
 *   and `X-Manager-Token`. The products endpoint's specification instead
 *   lists `Access-Token`, `Store-Id` and `Role`, and is inconsistent about
 *   which are required. Every request sends all of them; a header an
 *   endpoint does not read costs nothing.
 * - ORDER PAGINATION. The List Orders response documents no page fields, only
 *   `grand_total` across all pages. The walk stops on a short page, and
 *   also when it has read `grand_total` records if that is present.
 * - TIMESTAMPS carry no zone in any example. See ZidMap::TIMEZONE.
 *
 * Like SallaClient, it refuses a response it cannot read. A backfill that
 * reports "0 orders" because it parsed nothing is a false all-clear.
 */
final class ZidClient
{
    /** Zid's documented ceiling for a page of orders. */
    public const ORDERS_PER_PAGE = 100;

    public const PRODUCTS_PER_PAGE = 50;

    /** Far beyond any real store; a walk that reaches it is looping. */
    private const MAX_PAGES = 5000;

    public function __construct(private readonly ZidOAuth $oauth) {}

    /**
     * Every order created between two days, inclusive, in the store's zone.
     *
     * @return Generator<int, array<string, mixed>>
     */
    public function orders(Integration $integration, string $from, string $to): Generator
    {
        $offset = ZidMap::utcOffset();
        $read = 0;

        for ($page = 1; $page <= self::MAX_PAGES; $page++) {
            $body = $this->json($integration, 'managers/store/orders', [
                'page' => $page,
                'per_page' => self::ORDERS_PER_PAGE,
                // `default` is the only payload type that includes the lines.
                'payload_type' => 'default',
                'date_attribute' => 'created_at',
                'date_from' => "{$from}T00:00:00.000{$offset}",
                'date_to' => "{$to}T23:59:59.999{$offset}",
                'order_by' => 'created_at',
                'sort_by' => 'asc',
            ]);

            if (! isset($body['orders']) || ! is_array($body['orders'])) {
                throw new RuntimeException("Zid's order listing had no orders array; the API shape has changed.");
            }

            $records = array_values(array_filter($body['orders'], 'is_array'));

            foreach ($records as $record) {
                yield $record;
            }

            $read += count($records);
            $total = is_numeric($body['grand_total'] ?? null) ? (int) $body['grand_total'] : null;

            if (count($records) < self::ORDERS_PER_PAGE || ($total !== null && $read >= $total)) {
                return;
            }
        }

        throw new RuntimeException('Zid kept returning full pages of orders past any plausible end; stopped rather than loop.');
    }

    /**
     * Every product in the catalogue, following Zid's own `next` links.
     *
     * @return Generator<int, array<string, mixed>>
     */
    public function products(Integration $integration): Generator
    {
        for ($page = 1; $page <= self::MAX_PAGES; $page++) {
            $body = $this->json($integration, 'products/', [
                'page' => $page,
                'page_size' => self::PRODUCTS_PER_PAGE,
            ]);

            if (! isset($body['results']) || ! is_array($body['results'])) {
                throw new RuntimeException("Zid's product listing had no results array; the API shape has changed.");
            }

            foreach ($body['results'] as $record) {
                if (is_array($record)) {
                    yield $record;
                }
            }

            if (empty($body['next'])) {
                return;
            }
        }

        throw new RuntimeException('Zid kept offering a next page of products past any plausible end; stopped rather than loop.');
    }

    /**
     * The store these tokens belong to — called once, at connection, before
     * there is an Integration to call through.
     *
     * @return array{id: string, title: ?string}
     */
    public function profile(ZidTokens $tokens): array
    {
        $response = $this->request($tokens->authorization, $tokens->accessToken, null)
            ->get($this->url('managers/account/profile'));

        $this->assertOk($response, 'managers/account/profile');

        $store = $response->json('user.store');

        if (! is_array($store) || ! isset($store['id']) || ! is_scalar($store['id'])) {
            throw new RuntimeException("Zid's profile response named no store; the API shape has changed.");
        }

        return [
            'id' => (string) $store['id'],
            'title' => is_string($store['title'] ?? null) ? $store['title'] : null,
        ];
    }

    /**
     * Asks Zid to deliver one event to this installation.
     *
     * Zid signs nothing. Its only way to let a receiver tell a genuine
     * delivery from a forged one is Basic Auth credentials the app supplies
     * here, which Zid then sends back on every delivery (ZidWebhooks).
     */
    public function subscribe(Integration $integration, string $event, string $targetUrl, string $username, string $password): void
    {
        $credentials = $this->oauth->credentialsFor($integration);

        $response = $this->request($credentials['authorization'], $credentials['manager'], $integration->external_account_id)
            ->post($this->url('managers/webhooks'), [
                'event' => $event,
                'target_url' => $targetUrl,
                // "A unique identifier for the app that created this webhook."
                'original_id' => (string) config('integrations.zid.client_id'),
                'username' => $username,
                'password' => $password,
            ]);

        $this->assertOk($response, 'managers/webhooks');
    }

    /**
     * @param  array<string, mixed>  $query
     * @return array<string, mixed>
     */
    private function json(Integration $integration, string $path, array $query): array
    {
        $credentials = $this->oauth->credentialsFor($integration);

        $response = $this->request($credentials['authorization'], $credentials['manager'], $integration->external_account_id)
            ->get($this->url($path), $query);

        $this->assertOk($response, $path);

        $body = $response->json();

        if (! is_array($body)) {
            throw new RuntimeException("Zid's response to {$path} was not JSON.");
        }

        return $body;
    }

    private function request(string $authorization, string $manager, ?string $storeId): PendingRequest
    {
        $headers = [
            'X-Manager-Token' => $manager,
            'Access-Token' => $manager,
            'Role' => 'Manager',
            // English, or Zid answers in Arabic and the error text in
            // `last_error` is then unreadable to half of support.
            'Accept-Language' => 'en',
        ];

        if ($storeId !== null) {
            $headers['Store-Id'] = $storeId;
        }

        return Http::withToken($authorization)
            ->withHeaders($headers)
            ->acceptJson()
            ->timeout(30)
            // A 429 is waited out rather than reported as a missing order.
            ->retry(3, 2000, fn ($exception, $request): bool => true, throw: false);
    }

    private function url(string $path): string
    {
        return rtrim((string) config('integrations.zid.api_base'), '/').'/'.ltrim($path, '/');
    }

    private function assertOk(Response $response, string $path): void
    {
        if ($response->status() === 401) {
            throw new RuntimeException('Zid refused the token; the store must be reconnected.');
        }

        if (! $response->successful()) {
            throw new RuntimeException("Zid answered {$response->status()} for {$path}.");
        }
    }
}
