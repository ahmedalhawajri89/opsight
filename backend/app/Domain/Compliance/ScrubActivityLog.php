<?php

declare(strict_types=1);

namespace App\Domain\Compliance;

/**
 * Removing one person's details from the audit log, without removing the audit.
 *
 * THE RULE HERE IS THE OPPOSITE OF `AuditRedactor`'s, on purpose.
 *
 * That class drops the key outright — `password` does not appear as
 * `"password": "[redacted]"`, because the presence of the key is itself the
 * leak: it says a password was in scope. Here the presence of the key is the
 * surviving *auditable fact*. "Someone changed this customer's email on the
 * third of March" must still be true after the erasure; only the address
 * itself must go. Dropping the key would erase the accountability along with
 * the data, which is not what a data-subject request asks for.
 *
 * Two passes, because the person's details live in two differently-shaped
 * places (ADR-026):
 *
 *   `byKey`   — rows whose subject IS the customer. `customer.created` carries
 *               every attribute in `changes.after`; `customer.updated` carries
 *               the changed ones in `before` and `after`. Deterministic: the
 *               key names are known, so the replacement is exact.
 *
 *   `byValue` — rows that mention the person without naming them as a subject.
 *               The real case is `export.generated`, whose `context.filters`
 *               holds the search term a colleague typed — which may be the
 *               customer's email — and which has no `subject_id` to find it
 *               by. Best-effort by construction, and bounded deliberately:
 *               see `needles()`.
 *
 * Pure: array in, array out, no database and no model. The erasure service
 * owns the queries; this owns the shape.
 */
final class ScrubActivityLog
{
    /** What an erased value is replaced with, in every language. */
    public const SENTINEL = '[erased]';

    /**
     * Shorter needles are skipped in the value sweep.
     *
     * A four-character string is a substring of too much else. The targeted
     * pass has already covered every row that names the customer as its
     * subject, so what a short needle would add is a chance of corrupting an
     * unrelated row — and a wrong scrub that damages someone else's audit
     * history is worse than a stated, bounded gap.
     */
    public const MIN_NEEDLE = 6;

    /**
     * Replace the named keys wherever they appear, however deeply nested.
     *
     * @param  array<string, mixed>|null  $payload
     * @param  list<string>  $keys
     * @return array<string, mixed>|null
     */
    public function byKey(?array $payload, array $keys): ?array
    {
        if ($payload === null) {
            return null;
        }

        $scrubbed = [];

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                /** @var array<string, mixed> $value */
                $scrubbed[$key] = $this->byKey($value, $keys);

                continue;
            }

            // A key that held nothing held nothing about anyone: leaving the
            // null says "this field was not set", which is still true.
            $scrubbed[$key] = in_array((string) $key, $keys, strict: true) && $value !== null
                ? self::SENTINEL
                : $value;
        }

        return $scrubbed;
    }

    /**
     * Replace the given strings wherever they appear inside any value.
     *
     * @param  array<string, mixed>|null  $payload
     * @param  list<string>  $needles
     * @return array<string, mixed>|null
     */
    public function byValue(?array $payload, array $needles): ?array
    {
        if ($payload === null || $needles === []) {
            return $payload;
        }

        $scrubbed = [];

        foreach ($payload as $key => $value) {
            if (is_array($value)) {
                /** @var array<string, mixed> $value */
                $scrubbed[$key] = $this->byValue($value, $needles);

                continue;
            }

            $scrubbed[$key] = is_string($value)
                ? str_ireplace($needles, self::SENTINEL, $value)
                : $value;
        }

        return $scrubbed;
    }

    /**
     * The values worth sweeping for, out of what the customer used to hold.
     *
     * NAME IS ABSENT, DELIBERATELY. A customer called "Ali" would have that
     * substring struck out of "Alia Trading" in rows belonging to other
     * people. The targeted pass already covers every row that names this
     * customer as its subject, so the name's residual exposure is a search
     * filter in an `export.generated` row — a bounded, documented gap, and a
     * smaller harm than corrupting unrelated history.
     *
     * @param  array<string, mixed>  $original
     * @return list<string>
     */
    public function needles(array $original): array
    {
        $candidates = [
            $original['email'] ?? null,
            $original['phone'] ?? null,
            $original['vat_number'] ?? null,
            $original['address_line'] ?? null,
        ];

        $needles = [];

        foreach ($candidates as $candidate) {
            if (is_string($candidate) && mb_strlen($candidate) >= self::MIN_NEEDLE) {
                $needles[] = $candidate;
            }
        }

        return array_values(array_unique($needles));
    }
}
