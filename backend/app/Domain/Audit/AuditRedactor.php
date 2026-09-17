<?php

declare(strict_types=1);

namespace App\Domain\Audit;

/**
 * The central redaction list applied to every audit diff before it is written.
 *
 * One list, one application site. A second place that decides what is safe to
 * log is a second place to get it wrong, and the failure mode — a password in
 * a permanent, append-only table — is not one that can be cleaned up
 * afterwards (SECURITY.md §10).
 *
 * THE KEY IS DROPPED, NOT MASKED. Writing `"password": "[redacted]"` would
 * still put the key in the table, and SECURITY.md §15.14 requires that a diff
 * never contain a redaction-list key at all. Masking also invites the reader
 * to assume every other key was considered and cleared, which is exactly the
 * assumption this list exists to avoid making silently.
 *
 * The fact that a secret changed is not lost by dropping it: the ACTION
 * carries it. `user.password_changed` is written with an empty diff, which is
 * the auditable fact — someone changed it, when, and from which address —
 * without the value ever reaching the row.
 */
final class AuditRedactor
{
    /**
     * Matched case-insensitively against every key at every depth.
     *
     * Entries are exact key names rather than substrings. A substring match on
     * "token" would also drop a legitimate business field such as
     * `token_count`, and a redaction list that silently eats real data gets
     * loosened by the next person who trips over it.
     *
     * @var list<string>
     */
    public const KEYS = [
        'password',
        'password_confirmation',
        'current_password',
        'new_password',
        'plain_password',
        'remember_token',
        'api_token',
        'access_token',
        'refresh_token',
        'personal_access_token',
        'token',
        '_token',
        'csrf_token',
        'xsrf-token',
        'x-xsrf-token',
        'session_id',
        'secret',
        'client_secret',
        'authorization',
        'cookie',
        'set-cookie',
    ];

    /**
     * @param  array<array-key, mixed>  $data
     * @return array<array-key, mixed>
     */
    public function redact(array $data): array
    {
        $clean = [];

        foreach ($data as $key => $value) {
            if (is_string($key) && self::isRedacted($key)) {
                continue;
            }

            $clean[$key] = is_array($value) ? $this->redact($value) : $value;
        }

        return $clean;
    }

    public static function isRedacted(string $key): bool
    {
        return in_array(mb_strtolower($key), self::KEYS, strict: true);
    }
}
