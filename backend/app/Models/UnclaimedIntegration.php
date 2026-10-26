<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * A store that connected itself, waiting for a business to claim it.
 *
 * NEITHER TENANCY TRAIT, deliberately, and for the same reason as
 * WebhookReceipt: this row genuinely belongs to no business. Giving it
 * `BelongsToBusiness` would fill `business_id` from whatever context the
 * worker happened to be in — which, for a row created by an unauthenticated
 * delivery, means filing a stranger's store under whoever was last served.
 *
 * The tokens are encrypted by the same casts as Integration, and hidden for
 * the same reason: a cast that decrypts transparently will hand the
 * plaintext to any `toArray()` that gets near a response.
 *
 * @property string $provider
 * @property string $external_account_id
 * @property string|null $access_token
 * @property string|null $refresh_token
 * @property Carbon|null $token_expires_at
 * @property list<string>|null $scopes
 * @property string|null $store_name
 * @property Carbon $expires_at
 */
class UnclaimedIntegration extends Model
{
    /** @var list<string> */
    protected $fillable = [
        'provider',
        'external_account_id',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'scopes',
        'store_name',
        'expires_at',
    ];

    /** @var list<string> */
    protected $hidden = ['access_token', 'refresh_token'];

    /** How long a store waits to be claimed before its tokens are discarded. */
    public const CLAIM_WINDOW_MINUTES = 60;

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'access_token' => 'encrypted',
            'refresh_token' => 'encrypted',
            'token_expires_at' => 'datetime',
            'scopes' => 'array',
            'expires_at' => 'datetime',
        ];
    }

    public function hasExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
