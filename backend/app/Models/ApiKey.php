<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Carbon;
use Illuminate\Support\Str;

/**
 * A key for the universal connection: any system may send orders with it.
 *
 * @property int $id
 * @property int $business_id
 * @property string $name
 * @property string $prefix
 * @property string $hash
 * @property int|null $created_by
 * @property Carbon|null $last_used_at
 * @property int $orders_received
 * @property Carbon|null $revoked_at
 * @property Carbon|null $created_at
 */
class ApiKey extends Model
{
    use ScopedToBusiness;

    /** Every key starts with this, so a leaked one is easy to recognise and scan for. */
    public const MARK = 'bydr_';

    /** @var list<string> */
    protected $fillable = ['name'];

    /** @var list<string> */
    protected $hidden = ['hash'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
            'revoked_at' => 'datetime',
            'orders_received' => 'integer',
        ];
    }

    /**
     * A new key: the row (holding only the hash) and the key itself, which
     * the caller shows once and never stores.
     *
     * @return array{0: self, 1: string}
     */
    public static function issue(string $name, ?int $createdBy): array
    {
        $prefix = self::MARK.Str::lower(Str::random(8));
        $secret = $prefix.'_'.Str::random(40);

        $key = new self(['name' => $name]);
        $key->forceFill([
            'prefix' => $prefix,
            'hash' => hash('sha256', $secret),
            'created_by' => $createdBy,
        ])->save();

        return [$key, $secret];
    }

    /**
     * The live key a presented secret belongs to, or null. Looked up across
     * every business (the caller has no session yet), then compared in
     * constant time.
     */
    public static function findLive(string $secret): ?self
    {
        if (! str_starts_with($secret, self::MARK) || strlen($secret) < 20) {
            return null;
        }

        $prefix = substr($secret, 0, strlen(self::MARK) + 8);

        $key = self::withoutGlobalScopes()
            ->where('prefix', $prefix)
            ->whereNull('revoked_at')
            ->first();

        return $key !== null && hash_equals($key->hash, hash('sha256', $secret)) ? $key : null;
    }
}
