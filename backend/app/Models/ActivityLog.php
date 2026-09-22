<?php

declare(strict_types=1);

namespace App\Models;

use App\Support\Tenancy\ScopedToBusiness;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Carbon;

/**
 * Append-only audit trail.
 *
 * UPDATED_AT is disabled and the application exposes no update or delete path.
 * `changes` never contains a key on the redaction list — no password, token or
 * session identifier reaches this table (SECURITY.md §10).
 *
 * The JSON columns are declared here rather than left to inference: without
 * them, static analysis reads `changes` as the raw string the column holds and
 * every consumer of the decoded array looks like a type error.
 *
 * @property array<string, mixed>|null $changes
 * @property array<string, mixed>|null $context
 * @property Carbon $created_at
 */
class ActivityLog extends Model
{
    use ScopedToBusiness;

    public const UPDATED_AT = null;

    /**
     * A failed sign-in for an address that matches no account belongs to no
     * business, and is recorded as such rather than guessed at (ADR-023).
     */
    protected static function businessIsOptional(): bool
    {
        return true;
    }

    /** @var list<string> */
    protected $fillable = [
        // Set by AuditRecorder, which is the only writer.
        'business_id',
        'user_id',
        'action',
        'subject_type',
        'subject_id',
        'changes',
        'context',
        'ip_address',
        'user_agent',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'changes' => 'array',
            'context' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
