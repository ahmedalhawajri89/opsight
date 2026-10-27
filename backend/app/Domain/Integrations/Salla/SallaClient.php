<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Models\Integration;
use Generator;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Talking to Salla's Merchant API as one connected store.
 *
 * Thin on purpose. It holds the three things every call needs and nothing
 * about what any particular call means: the token (fetched through
 * SallaOAuth, so no caller has to know what a fortnight is), the base URL,
 * and what to do when Salla says "slow down".
 *
 * WHERE THE FIELD NAMES COME FROM. Salla's own documentation did not render
 * the List Orders page for the parameters below; they are taken from the
 * published OpenAPI description of the endpoint. They are therefore the one
 * part of this integration that has NOT been read from a sentence Salla
 * wrote, and they are gathered here, named, so the first live run has one
 * place to correct rather than a search to run.
 *
 * That is also why this refuses to guess at a response it does not
 * recognise. A reconciliation that reports no differences because it parsed
 * nothing is worse than no reconciliation: it is a false all-clear, and
 * somebody acts on it.
 */
final class SallaClient
{
    /** Salla's documented ceiling for a page of records. */
    public const MAX_PER_PAGE = 60;

    public function __construct(private readonly SallaOAuth $oauth) {}

    /**
     * One page of a listing.
     *
     * @param  array<string, mixed>  $query
     * @return array{records: list<array<string, mixed>>, page: int, totalPages: int, total: int}
     */
    public function page(Integration $integration, string $path, array $query = []): array
    {
        $response = $this->get($integration, $path, $query);

        $body = $response->json();

        if (! is_array($body) || ! isset($body['data']) || ! is_array($body['data'])) {
            throw new RuntimeException("Salla's response to {$path} had no data array; the API shape has changed.");
        }

        /** @var list<array<string, mixed>> $records */
        $records = array_values(array_filter($body['data'], 'is_array'));

        $pagination = $body['pagination'] ?? null;

        if (! is_array($pagination)) {
            /*
             * A listing with no pagination block cannot be walked safely: we
             * would read the first page and treat it as the whole period.
             * Said plainly, rather than quietly returning a short answer.
             */
            throw new RuntimeException("Salla's response to {$path} had no pagination block; its page count cannot be trusted.");
        }

        return [
            'records' => $records,
            'page' => (int) ($pagination['currentPage'] ?? 1),
            'totalPages' => (int) ($pagination['totalPages'] ?? 1),
            'total' => (int) ($pagination['total'] ?? count($records)),
        ];
    }

    /**
     * Every page of a listing, as one generator.
     *
     * A generator rather than an array: a year of orders is tens of
     * thousands of records, and the caller only ever needs one at a time.
     *
     * @param  array<string, mixed>  $query
     * @return Generator<int, array<string, mixed>>
     */
    public function each(Integration $integration, string $path, array $query = []): Generator
    {
        $page = 1;

        do {
            $result = $this->page($integration, $path, $query + [
                'page' => $page,
                'per_page' => self::MAX_PER_PAGE,
            ]);

            foreach ($result['records'] as $record) {
                yield $record;
            }

            /*
             * Driven by Salla's own page number rather than ours. If the API
             * ignores `page` and keeps returning the first one, this stops
             * instead of looping for ever on the same sixty records.
             */
            $reported = $result['page'];
            $page = max($page, $reported) + 1;
        } while ($page <= $result['totalPages']);
    }

    /** @param array<string, mixed> $query */
    public function get(Integration $integration, string $path, array $query = []): Response
    {
        $token = $this->oauth->accessTokenFor($integration);
        $base = rtrim((string) config('integrations.salla.api_base'), '/');

        $response = Http::withToken($token)
            ->acceptJson()
            ->timeout(30)
            /*
             * Salla rate-limits. `retry` with `throw: false` leaves the
             * refusal in hand so a 429 is waited out rather than reported as
             * a missing order — which is what a reconciliation would
             * otherwise print.
             */
            ->retry(3, 2000, fn ($exception, $request): bool => true, throw: false)
            ->get($base.'/'.ltrim($path, '/'), $query);

        if ($response->status() === 401) {
            throw new RuntimeException('Salla refused the token; the store must be reconnected.');
        }

        if (! $response->successful()) {
            throw new RuntimeException("Salla answered {$response->status()} for {$path}.");
        }

        return $response;
    }
}
