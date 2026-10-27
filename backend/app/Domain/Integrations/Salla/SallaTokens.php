<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Salla;

use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * A set of Salla tokens, read from a payload that cannot be trusted to be
 * consistent about how it states their lifetime.
 *
 * SALLA'S DOCUMENTATION CONTRADICTS ITSELF HERE, in two ways, and both are
 * handled rather than picked between:
 *
 * - The field is `expires` in the install payload and `expires_in` in the
 *   refresh response. Either name is read.
 * - The same page calls the value "a unix timestamp" in one sentence and
 *   seconds in another, and its own example — 1209599, two weeks less a
 *   second — is plainly a duration. So the value is read as a duration when
 *   it is small enough to be one, and as a timestamp when it is large enough
 *   to be a date. The boundary is wide: a duration long enough to be mistaken
 *   for a timestamp would be thirty years.
 *
 * Guessing either way would be a token that expires in 1970 or in 40,000 —
 * the first disconnects every store on the hour, the second never refreshes
 * and disconnects them all silently a fortnight later.
 */
final class SallaTokens
{
    private function __construct(
        public readonly string $accessToken,
        public readonly ?string $refreshToken,
        public readonly CarbonImmutable $expiresAt,
        /** @var list<string> */
        public readonly array $scopes,
    ) {}

    /** @param array<string, mixed> $data */
    public static function fromPayload(array $data): self
    {
        $accessToken = $data['access_token'] ?? null;

        if (! is_string($accessToken) || $accessToken === '') {
            throw new RuntimeException('Salla sent no access token.');
        }

        $refreshToken = $data['refresh_token'] ?? null;

        return new self(
            accessToken: $accessToken,
            refreshToken: is_string($refreshToken) && $refreshToken !== '' ? $refreshToken : null,
            expiresAt: self::expiryFrom($data['expires'] ?? $data['expires_in'] ?? null),
            scopes: self::scopesFrom($data['scope'] ?? null),
        );
    }

    /**
     * The columns an Integration or an UnclaimedIntegration stores.
     *
     * @return array<string, mixed>
     */
    public function toAttributes(): array
    {
        return [
            'access_token' => $this->accessToken,
            'refresh_token' => $this->refreshToken,
            'token_expires_at' => $this->expiresAt,
            'scopes' => $this->scopes,
        ];
    }

    /**
     * Whether a refresh is even possible.
     *
     * Salla only issues a refresh token when the app asked for the
     * `offline_access` scope. Without it the connection simply dies after a
     * fortnight, and an operator should learn that from the connection
     * screen rather than from a merchant's phone call.
     */
    public function canRefresh(): bool
    {
        return $this->refreshToken !== null;
    }

    /** A duration in seconds, or a unix timestamp; see the class comment. */
    private static function expiryFrom(mixed $value): CarbonImmutable
    {
        $seconds = is_numeric($value) ? (int) $value : 0;

        if ($seconds <= 0) {
            // Said nothing, or said something meaningless. Treated as expired
            // so the next call refreshes rather than sending a dead token and
            // reading the 401 as the store having uninstalled.
            return CarbonImmutable::now();
        }

        // Ten years in seconds. Below it, a duration; above it, a date.
        return $seconds < 315_360_000
            ? CarbonImmutable::now()->addSeconds($seconds)
            : CarbonImmutable::createFromTimestampUTC($seconds);
    }

    /** @return list<string> */
    private static function scopesFrom(mixed $value): array
    {
        if (! is_string($value) || trim($value) === '') {
            return [];
        }

        return array_values(array_filter(preg_split('/\s+/', trim($value)) ?: []));
    }
}
