<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;

/**
 * One connected provider account, per business (ADR-027).
 *
 * THE TOKENS ARE ENCRYPTED BY A CAST, which means two things worth being
 * explicit about. They are unreadable in the database, in a dump and in a
 * backup — the threat being a copy of the data leaving the server, after
 * which someone else's store is wide open. And they are unreadable WITHOUT
 * `APP_KEY`, so rotating that key without re-encrypting these columns
 * disconnects every integration. That is the trade, and it is the right one:
 * a lost connection is a reconnection, and a leaked refresh token is someone
 * else reading a business's whole order history.
 *
 * `last_error` deliberately holds the provider's own words. An integration
 * that has stopped working is a support conversation, and "it failed" is not
 * a conversation.
 *
 * @property int $business_id
 * @property string $provider
 * @property string|null $external_account_id
 * @property string $status
 * @property string|null $access_token
 * @property string|null $refresh_token
 * @property Carbon|null $token_expires_at
 * @property list<string>|null $scopes
 * @property Carbon|null $last_synced_at
 * @property string|null $last_error
 */
class Integration extends Model
{
    use ScopedToBusiness;

    public const STATUS_CONNECTED = 'connected';

    public const STATUS_EXPIRED = 'expired';

    public const STATUS_REVOKED = 'revoked';

    public const STATUS_ERROR = 'error';

    /** @var list<string> */
    protected $fillable = [
        'provider',
        'external_account_id',
        'status',
        'access_token',
        'refresh_token',
        'token_expires_at',
        'scopes',
        'last_synced_at',
        'last_error',
    ];

    /**
     * Never serialised, however carelessly a resource is written.
     *
     * The cast decrypts them transparently, so a `toArray()` anywhere near a
     * response would hand the plaintext to the client. Hiding them here means
     * reaching for a token has to be deliberate.
     *
     * @var list<string>
     */
    protected $hidden = ['access_token', 'refresh_token'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'access_token' => 'encrypted',
            'refresh_token' => 'encrypted',
            'token_expires_at' => 'datetime',
            'last_synced_at' => 'datetime',
            'scopes' => 'array',
        ];
    }

    /**
     * Whether the access token is past its stated life.
     *
     * A provider that tells us nothing about expiry gets the benefit of the
     * doubt: the refusal, when it comes, is the thing that triggers a refresh.
     */
    public function tokenHasExpired(): bool
    {
        return $this->token_expires_at !== null && $this->token_expires_at->isPast();
    }

    public function isUsable(): bool
    {
        return $this->status === self::STATUS_CONNECTED && $this->access_token !== null;
    }
}
