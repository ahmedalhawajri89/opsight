<?php

declare(strict_types=1);

namespace App\Domain\Integrations;

use App\Models\Integration;
use App\Models\Order;

/**
 * A store Baydar can read its history from (ADR-037).
 *
 * WHAT IS IN THE CONTRACT AND WHAT IS NOT. A connector answers three
 * questions: where its records are (`catalogue`, `orders`), and what one of
 * them means here (`importProduct`, `importOrder`). Everything that must be
 * the same for every store — matching on `(source, external_id)`, leaving
 * stock alone, keeping an erased customer erased — lives in
 * RecordImportedOrder and RecordImportedProduct, which every implementation
 * hands its translated records to.
 *
 * Receiving webhooks stays its own contract, `WebhookProvider`, because the
 * two are not the same shape across stores: Salla signs its deliveries with
 * an HMAC, Zid offers only Basic Auth credentials the app chose itself. And
 * how a store is first connected varies most of all — Salla hands over its
 * tokens in an install event, Zid runs an OAuth redirect — so that is left
 * to each provider's own controller rather than forced into a method here.
 *
 * Moving Salla onto this contract before any second store was written is
 * how it was checked against a real provider rather than an imagined one.
 */
interface Connector
{
    /** The `source` written on every record it imports: 'salla'. */
    public function provider(): string;

    /**
     * Every catalogue entry, one raw payload at a time.
     *
     * @return iterable<int, array<string, mixed>>
     */
    public function catalogue(Integration $connection): iterable;

    /**
     * Every order placed between two days, inclusive, one raw payload at a time.
     *
     * @return iterable<int, array<string, mixed>>
     */
    public function orders(Integration $connection, string $from, string $to): iterable;

    /**
     * Imports one catalogue entry, which may be several products: a Zid
     * product with options is one entry whose variants are what is sold.
     * The first change the second provider forced on the contract, which
     * began as `?Product` because Salla's entries are one product each.
     *
     * @param  array<string, mixed>  $payload
     */
    public function importProduct(array $payload): void;

    /** @param  array<string, mixed>  $payload */
    public function importOrder(array $payload): Order;
}
