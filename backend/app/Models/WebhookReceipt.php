<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\MassPrunable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * One delivery from a provider, stored before it is believed (ADR-027).
 *
 * NEITHER TENANCY TRAIT, which is the unusual choice here and a deliberate
 * one — the only model in the system to carry `business_id` without them.
 *
 * `ScopedToBusiness` is wrong because a receipt is written by an
 * unauthenticated request with no business in context, and because scoping
 * reads would hide exactly the rows an operator needs when asking "did
 * anything arrive that we rejected?".
 *
 * `BelongsToBusiness` is wrong for a subtler and more important reason: it
 * fills `business_id` from whatever business is in context when the row is
 * created. For every other model that is right. Here it would mean a
 * delivery's owner coming from ambient state rather than from the payload
 * that was just cryptographically verified — and a test caught precisely
 * that, filing an unverified delivery under a real business. The business is
 * resolved by the provider from the payload, explicitly, or it is null.
 *
 * `signature_ok` false is kept rather than dropped. A delivery that failed
 * verification is the single most interesting row in this table: either a
 * secret has rotated, or someone is trying.
 *
 * @property int|null $business_id
 * @property string $provider
 * @property string $event
 * @property string $external_event_id
 * @property array<string, mixed> $payload
 * @property bool $signature_ok
 * @property Carbon|null $processed_at
 * @property string|null $error
 * @property int $attempts
 */
class WebhookReceipt extends Model
{
    use MassPrunable;

    /** Days a rejected delivery is kept as evidence before it is swept. */
    public const UNVERIFIED_DAYS = 30;

    /**
     * Days a delivery is kept once it has been imported. Its work is done —
     * the order or product it carried is in the store's own tables — and
     * what is left is a copy of a customer's details and, for an install,
     * of the store's tokens. A provider retries for hours, not months, so
     * this is far past any duplicate the unique event id has to catch.
     */
    public const PROCESSED_DAYS = 90;

    /** @var list<string> */
    protected $fillable = [
        'business_id',
        'provider',
        'event',
        'external_event_id',
        'payload',
        'signature_ok',
        'processed_at',
        'error',
        'attempts',
    ];

    /** @return BelongsTo<Business, $this> */
    public function business(): BelongsTo
    {
        return $this->belongsTo(Business::class);
    }

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            // Encrypted at rest: an install event carries the store's tokens.
            'payload' => 'encrypted:array',
            'signature_ok' => 'boolean',
            'processed_at' => 'datetime',
            'attempts' => 'integer',
        ];
    }

    /**
     * A rejected delivery is a month of evidence about who knocked, and after
     * that, only bulk. A verified one is kept while it is still being worked
     * on, and for PROCESSED_DAYS once it has been imported; after that it is
     * only a copy of personal data (and, for an install, of tokens) that the
     * import itself no longer needs. One still failing is never swept.
     *
     * @return Builder<static>
     */
    public function prunable(): Builder
    {
        return static::query()->where(function (Builder $query): void {
            $query
                ->where(function (Builder $rejected): void {
                    $rejected->where('signature_ok', false)
                        ->where('created_at', '<', now()->subDays(self::UNVERIFIED_DAYS));
                })
                // Imported and long done. A delivery still failing is kept.
                ->orWhere(function (Builder $done): void {
                    $done->where('signature_ok', true)
                        ->whereNotNull('processed_at')
                        ->where('processed_at', '<', now()->subDays(self::PROCESSED_DAYS));
                });
        });
    }

    public function isProcessed(): bool
    {
        return $this->processed_at !== null;
    }

    public function markProcessed(): void
    {
        $this->forceFill(['processed_at' => now(), 'error' => null])->save();
    }

    public function markFailed(string $error): void
    {
        // Truncated, because a stack trace in a text column helps nobody and
        // the real one is in the log with its reference.
        $this->forceFill(['error' => mb_substr($error, 0, 1000)])->save();
    }
}
