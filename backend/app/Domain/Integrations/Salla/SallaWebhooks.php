<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use App\Domain\Integrations\WebhookProvider;
use App\Models\Integration;
use App\Models\WebhookReceipt;
use App\Support\Tenancy\BusinessScope;
use RuntimeException;

/**
 * Salla, at the door (ADR-027, P2 phase 6).
 *
 * Everything here was read from Salla's current documentation rather than
 * assumed, and three things it says are worth writing down because they are
 * not what a reader would guess:
 *
 * - The signature is **HMAC-SHA256 over the raw body**, keyed with the
 *   webhook secret, as hex. Salla's prose calls it "the request body's
 *   SHA256 hash", which would be a hash anyone could compute; its own code
 *   samples use `hash_hmac`. The samples are right — a plain hash of the
 *   body authenticates nothing — and this follows the samples.
 * - Salla retries **three times, about five minutes apart**, with a thirty
 *   second timeout. A delivery arriving twice is normal traffic, not an
 *   attack, and the receipt table's unique index is what makes the second
 *   one harmless.
 * - There is **no delivery id** in the envelope. See externalEventId.
 *
 * Salla's own PHP sample compares with `===` and its Node sample forgets to
 * return after a 401, so it answers 200 to a forged delivery as well. Neither
 * mistake is repeated here.
 */
class SallaWebhooks implements WebhookProvider
{
    public const PROVIDER = 'salla';

    public function name(): string
    {
        return self::PROVIDER;
    }

    public function signatureHeader(): string
    {
        return 'x-salla-signature';
    }

    public function verify(string $payload, string $signature, string $secret): bool
    {
        $expected = hash_hmac('sha256', $payload, $secret);

        /*
         * hash_equals, never ===. A comparison that stops at the first wrong
         * byte takes measurably longer the more of the guess was right, which
         * is enough to recover a signature one byte at a time. It is also
         * why this compares the hex strings rather than raw bytes: both are
         * fixed length, so the length check leaks nothing either.
         */
        return hash_equals($expected, $signature);
    }

    /**
     * An id for this delivery, derived because Salla sends none.
     *
     * The envelope carries `event`, `merchant`, `created_at` and `data`, and
     * nothing identifying the delivery itself. So the id is a hash of the
     * whole payload, which gives exactly the property the receipt table
     * needs: a retry is byte-for-byte the same delivery and hashes the same,
     * while two genuine events differ somewhere and do not.
     *
     * NOT a hash of `event` + `merchant` + `data.id`, which was the obvious
     * first answer and is wrong: an order updated twice would collide, and
     * the second update — the one that matters — would be discarded as a
     * duplicate of the first.
     *
     * `created_at` is not enough to separate them either. Salla writes it to
     * the second, and two updates inside one second are not rare on a busy
     * store.
     *
     * @param  array<string, mixed>  $payload
     */
    public function externalEventId(array $payload): string
    {
        // Sorted so a provider that reorders its JSON keys between a delivery
        // and its retry still produces one id.
        $canonical = $this->canonicalise($payload);

        return self::PROVIDER.':'.hash('sha256', (string) json_encode($canonical));
    }

    /** @param  array<string, mixed>  $payload */
    public function event(array $payload): string
    {
        $event = $payload['event'] ?? null;

        // A verified delivery whose envelope has no event name is Salla
        // changing shape under us. Naming it plainly beats storing '' and
        // wondering later.
        return is_string($event) && $event !== '' ? $event : 'unknown';
    }

    /**
     * Which business this store belongs to.
     *
     * `merchant` is Salla's own numeric id for the store, and it is what a
     * connection is keyed by. Matched with the business scope REMOVED: this
     * runs at the door, before any business context exists, and the scope
     * would otherwise filter the row away and report every delivery as
     * belonging to nobody.
     *
     * @param  array<string, mixed>  $payload
     */
    public function businessIdFor(array $payload): ?int
    {
        $merchant = $payload['merchant'] ?? null;

        if (! is_int($merchant) && ! is_string($merchant)) {
            return null;
        }

        $businessId = Integration::query()
            ->withoutGlobalScope(BusinessScope::class)
            ->where('provider', self::PROVIDER)
            ->where('external_account_id', (string) $merchant)
            ->value('business_id');

        return $businessId === null ? null : (int) $businessId;
    }

    public function handle(WebhookReceipt $receipt): void
    {
        /*
         * Phase 6 builds the importer on top of this. Until it does, a
         * verified delivery is stored and acknowledged and nothing is
         * invented from it.
         *
         * It throws rather than returning quietly so the receipt is marked
         * failed with a reason an operator can read, instead of being marked
         * processed — which would be a lie, and the kind that is discovered
         * only when someone asks why an order never arrived.
         */
        throw new RuntimeException("No importer handles '{$receipt->event}' yet.");
    }

    /**
     * The same payload, with every object's keys in a fixed order.
     *
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
