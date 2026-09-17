<?php

declare(strict_types=1);

namespace App\Domain\Audit;

use App\Models\ActivityLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

/**
 * The only path that writes to `activity_logs`.
 *
 * Everything that must be auditable goes through here: the model observer for
 * ordinary CRUD, the domain services for state transitions, the auth listeners
 * and the exporter. Controllers do not write audit rows directly — a rule
 * enforced by there being exactly one class with an `ActivityLog::create` call
 * in it (SECURITY.md §2.6).
 *
 * WRITES PARTICIPATE IN THE CALLER'S TRANSACTION. This is deliberate. An order
 * confirmation that rolls back must leave no trace saying it happened, because
 * it did not happen. The inverse — an audit row surviving a rolled-back
 * operation — would make the log actively misleading, which is worse than a
 * gap. Consequently a failing audit write fails the business operation, and
 * that is the intended trade: this system's whole claim is that its records
 * can be trusted.
 *
 * No exception is swallowed here for the same reason.
 */
final class AuditRecorder
{
    /**
     * Seeding and similar fabrications switch auditing off (see `pause`).
     */
    private static bool $paused = false;

    public function __construct(private readonly AuditRedactor $redactor) {}

    /**
     * Suspends audit writing for the current process.
     *
     * The only sanctioned caller is the demo seeder. Seeded history is a
     * fabrication of past user actions, and an audit row generated while
     * fabricating it would be false in every field that matters: it would name
     * the seeding user as the actor, the console as the origin, and today as
     * the moment — for an order supposedly placed fourteen months ago. A log
     * that lies about its own provenance is worse than no log, so the seeder
     * pauses this and writes a small, honest set of entries instead.
     *
     * Not exposed through any HTTP path, and the test suite asserts that a
     * request-time write is audited, so this cannot be left on by accident.
     */
    public static function pause(): void
    {
        self::$paused = true;
    }

    public static function resume(): void
    {
        self::$paused = false;
    }

    public static function paused(): bool
    {
        return self::$paused;
    }

    /**
     * @param  array{before?: array<string, mixed>, after?: array<string, mixed>}|null  $changes
     * @param  array<string, mixed>|null  $context
     */
    public function record(
        string $action,
        ?Model $subject = null,
        ?array $changes = null,
        ?array $context = null,
        ?int $actorId = null,
    ): ?ActivityLog {
        if (self::$paused) {
            return null;
        }

        $request = $this->request();

        return ActivityLog::query()->create([
            'user_id' => $actorId ?? Auth::id(),
            'action' => $action,

            // The class basename, not the FQCN: a namespace reorganisation must
            // not orphan ten years of audit rows.
            'subject_type' => $subject !== null ? class_basename($subject) : null,
            'subject_id' => $subject?->getKey(),

            'changes' => $changes !== null ? $this->redactor->redact($changes) : null,
            'context' => $context !== null ? $this->redactor->redact($context) : null,

            // Packed binary, so IPv4 and IPv6 share one fixed-width column.
            'ip_address' => $this->packedIp($request?->ip()),
            'user_agent' => $this->truncate($request?->userAgent()),
        ]);
    }

    /**
     * The diff for an updated model: changed attributes only, on both sides.
     *
     * A full before/after snapshot of every column would bury the one field
     * that moved and multiply the table's size by the width of the row. The
     * reader of an audit log is asking "what changed", not "what was there".
     *
     * @return array{before: array<string, mixed>, after: array<string, mixed>}|null
     */
    public function diff(Model $model): ?array
    {
        $after = $model->getChanges();

        // Pure bookkeeping. A row whose only change is `updated_at` has not
        // changed in any sense a reader cares about.
        unset($after['updated_at'], $after['created_at']);

        if ($after === []) {
            return null;
        }

        /** @var array<string, mixed> $original */
        $original = $model->getRawOriginal();

        $before = [];

        foreach (array_keys($after) as $key) {
            // RAW originals, not cast ones: the diff records what was in the
            // column, so a reader comparing it against the database sees the
            // same value rather than a formatted one.
            $before[$key] = $original[$key] ?? null;
        }

        return ['before' => $before, 'after' => $after];
    }

    private function request(): ?Request
    {
        // Absent in console context — a seeder, a queued job or an artisan
        // command still audits, just without an address or user agent.
        if (! app()->bound('request')) {
            return null;
        }

        return app('request');
    }

    private function packedIp(?string $ip): ?string
    {
        if ($ip === null || $ip === '') {
            return null;
        }

        $packed = @inet_pton($ip);

        return $packed === false ? null : $packed;
    }

    private function truncate(?string $agent): ?string
    {
        if ($agent === null || $agent === '') {
            return null;
        }

        return mb_substr($agent, 0, 255);
    }
}
