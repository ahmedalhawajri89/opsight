<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use App\Domain\Integrations\WebhookProvider;
use App\Models\Integration;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use RuntimeException;

/**
 * Zid, at the door (ADR-027, ADR-037).
 *
 * ZID SIGNS NOTHING, and that is the most important line in this file. Salla
 * sends an HMAC of the body; Zid's documentation describes exactly one way
 * for a receiver to tell its deliveries from a forgery: Basic Auth
 * credentials the app chose when it created the webhook, sent back as an
 * `Authorization` header on every delivery. So that is what is checked.
 *
 * It is weaker, and worth saying how. A shared password proves who sent a
 * delivery, not what it said: anyone positioned to read a delivery in transit
 * could replay it or alter its body. TLS on the receiving URL is what stands
 * between that and a forged order, and the password is installation-wide
 * (ZID_WEBHOOK_SECRET), so rotating it means re-registering every store's
 * webhooks. Accepted, because it is the only mechanism Zid offers — and a
 * delivery that slipped through can only re-import an order's state, which
 * the next backfill overwrites with what Zid's API actually holds.
 *
 * WHAT A DELIVERY IS. Zid's documentation lists its events but prints no
 * envelope, so the event is read from the payload's shape: an order carries
 * `order_status`, a product carries `sku` or `structure`. Every order event
 * is handled the same way — import the order as it now stands — so knowing
 * that it is an order is all the handler needs. Named here as the first
 * thing to check against a live delivery.
 */
class ZidWebhooks implements WebhookProvider
{
    public const PROVIDER = 'zid';

    /** The Basic Auth user Zid is given; the password is the secret. */
    public const USERNAME = 'baydar';

    /** The events subscribed to when a store connects. */
    public const EVENTS = [
        'order.create',
        'order.status.update',
        'order.payment_status.update',
        'product.create',
        'product.update',
    ];

    public function __construct(
        private readonly ImportZidOrder $orders,
        private readonly ImportZidProduct $products,
    ) {}

    public function name(): string
    {
        return self::PROVIDER;
    }

    public function signatureHeader(): string
    {
        return 'authorization';
    }

    /** What Zid sends back, given these credentials. */
    public static function expectedHeader(string $secret): string
    {
        return 'Basic '.base64_encode(self::USERNAME.':'.$secret);
    }

    public function verify(string $payload, string $signature, string $secret): bool
    {
        // hash_equals, never ===: see SallaWebhooks::verify.
        return hash_equals(self::expectedHeader($secret), $signature);
    }

    /**
     * Derived from the whole payload, because Zid sends no delivery id. A
     * retry is byte-for-byte the same and hashes the same; two updates to one
     * order differ somewhere and do not.
     *
     * @param  array<string, mixed>  $payload
     */
    public function externalEventId(array $payload): string
    {
        return self::PROVIDER.':'.hash('sha256', (string) json_encode($this->canonicalise($payload)));
    }

    /** @param  array<string, mixed>  $payload */
    public function event(array $payload): string
    {
        if (isset($payload['order_status'])) {
            return 'order';
        }

        if (isset($payload['sku']) || isset($payload['structure'])) {
            return 'product';
        }

        return 'unknown';
    }

    /** @param  array<string, mixed>  $payload */
    public function businessIdFor(array $payload): ?int
    {
        $store = $payload['store_id'] ?? null;

        if (! is_int($store) && ! is_string($store)) {
            return null;
        }

        $businessId = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', self::PROVIDER)
            ->where('external_account_id', (string) $store)
            ->value('business_id');

        return $businessId === null ? null : (int) $businessId;
    }

    /**
     * None. A Zid store is connected through OAuth, in the owner's own
     * session, so no delivery ever arrives before its business exists.
     */
    public function acceptsUnmatched(string $event): bool
    {
        return false;
    }

    public function handle(WebhookReceipt $receipt): void
    {
        /** @var array<string, mixed> $payload */
        $payload = $receipt->payload ?? [];

        match ($receipt->event) {
            'order' => ($this->orders)($payload),
            'product' => ($this->products)($payload),
            default => throw new RuntimeException('A Zid delivery arrived that is neither an order nor a product.'),
        };
    }

    /**
     * @param  array<array-key, mixed>  $value
     * @return array<array-key, mixed>
     */
    private function canonicalise(array $value): array
    {
        if (! array_is_list($value)) {
            ksort($value);
        }

        foreach ($value as $key => $item) {
            if (is_array($item)) {
                $value[$key] = $this->canonicalise($item);
            }
        }

        return $value;
    }
}
