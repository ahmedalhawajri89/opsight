<?php

declare(strict_types=1);

namespace App\Models;

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
            'payload' => 'array',
            'signature_ok' => 'boolean',
            'processed_at' => 'datetime',
            'attempts' => 'integer',
        ];
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
