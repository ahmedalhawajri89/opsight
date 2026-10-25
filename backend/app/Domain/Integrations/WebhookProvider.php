<?php

declare(strict_types=1);

namespace App\Domain\Integrations;

use App\Models\WebhookReceipt;

/**
 * What the receiving endpoint needs to know about a provider (ADR-027).
 *
 * NO IMPLEMENTATION SHIPS WITH THIS PHASE, and that is the point. Salla's
 * signature header, its event names and the shape of its payloads are
 * details to be read from Salla's current documentation when the importer is
 * built, not guessed at now — guessing would produce a contract shaped around
 * an imagined provider that the real one then has to be bent into.
 *
 * What ships is the part that is the same for every provider worth
 * integrating: a delivery arrives, its signature is checked against a shared
 * secret, it is stored under the provider's own event id so a retry is
 * recognisable, and it is handled out of band.
 *
 * The registry resolves these from `config/integrations.php`, so an unknown
 * provider is a 404 rather than a route that silently accepts anything.
 */
interface WebhookProvider
{
    /** As it appears in the URL: /webhooks/{provider}. */
    public function name(): string;

    /**
     * Whether this delivery really came from the provider.
     *
     * Implementations compare with `hash_equals`, never `===`: a signature
     * check that returns early on the first wrong byte tells an attacker how
     * much of their guess was right.
     */
    public function verify(string $payload, string $signature, string $secret): bool;

    /** The header carrying the signature, lowercased. */
    public function signatureHeader(): string;

    /**
     * The provider's own id for this delivery — what makes a retry
     * recognisable as the same event rather than a second one.
     *
     * A provider that sends no such id gets one derived from the payload by
     * the implementation, which must be deterministic for the same delivery.
     *
     * @param  array<string, mixed>  $payload
     */
    public function externalEventId(array $payload): string;

    /**
     * What happened, in the provider's vocabulary: `order.created`.
     *
     * @param  array<string, mixed>  $payload
     */
    public function event(array $payload): string;

    /**
     * Which business this delivery belongs to, or null if none matches.
     *
     * Resolved from the payload against `integrations.external_account_id`,
     * and only ever called after the signature has verified — the payload is
     * not trusted to name a business until it has been shown to be genuine.
     *
     * @param  array<string, mixed>  $payload
     */
    public function businessIdFor(array $payload): ?int;

    /** Act on a delivery that has verified, inside its business's context. */
    public function handle(WebhookReceipt $receipt): void;
}
