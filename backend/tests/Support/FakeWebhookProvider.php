<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Domain\Integrations\WebhookProvider;
use App\Models\Integration;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Throwable;

/**
 * A provider for the tests, because no real one ships in Phase 5.
 *
 * Deliberately NOT a mock. The webhook infrastructure's whole job is a
 * sequence — verify, store under the provider's event id, answer, hand off —
 * and a mock that returns true would test the sequence against nothing. This
 * signs with HMAC-SHA256, which is what Salla and Meta both use, so the
 * contract is exercised by something shaped like the real thing.
 *
 * What it handles: it records that it ran, by writing the delivery's business
 * and the business in context at the moment of handling. That is how the
 * tenant-context tests can tell "ran as the right business" from "ran".
 */
class FakeWebhookProvider implements WebhookProvider
{
    /** @var list<array{receipt: int, business: int|null, context: int|null}> */
    public static array $handled = [];

    /** Set by a test that wants the handler to blow up. */
    public static ?Throwable $throws = null;

    public static function reset(): void
    {
        self::$handled = [];
        self::$throws = null;
    }

    public static function sign(string $payload, string $secret): string
    {
        return hash_hmac('sha256', $payload, $secret);
    }

    public function name(): string
    {
        return 'fake';
    }

    public function verify(string $payload, string $signature, string $secret): bool
    {
        return hash_equals(self::sign($payload, $secret), $signature);
    }

    public function signatureHeader(): string
    {
        return 'x-fake-signature';
    }

    /** @param array<string, mixed> $payload */
    public function externalEventId(array $payload): string
    {
        return (string) ($payload['event_id'] ?? 'fake-'.md5(serialize($payload)));
    }

    /** @param array<string, mixed> $payload */
    public function event(array $payload): string
    {
        return (string) ($payload['event'] ?? 'unknown');
    }

    /** @param array<string, mixed> $payload */
    public function businessIdFor(array $payload): ?int
    {
        $store = $payload['store_id'] ?? null;

        if ($store === null) {
            return null;
        }

        // Unscoped on purpose: resolving which business a delivery belongs to
        // happens before any business is in context.
        return Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', 'fake')
            ->where('external_account_id', (string) $store)
            ->value('business_id');
    }

    public function handle(WebhookReceipt $receipt): void
    {
        if (self::$throws !== null) {
            throw self::$throws;
        }

        self::$handled[] = [
            'receipt' => (int) $receipt->getKey(),
            'business' => $receipt->business_id,
            'context' => CurrentBusiness::get()->idOrNull(),
        ];
    }
}
