<?php

declare(strict_types=1);

namespace App\Domain\Integrations\Zid;

use Carbon\CarbonImmutable;
use RuntimeException;

/**
 * The credentials Zid issues for one store.
 *
 * TWO TOKENS, AND EVERY CALL NEEDS BOTH. Zid's token response carries
 * `authorization`, sent as `Authorization: Bearer …`, and `access_token`,
 * sent as `X-Manager-Token`. They expire together. Read from Zid's
 * Authorization documentation, which is explicit that `expires_in` is a
 * number of seconds and not a date — unlike Salla's, which contradicts
 * itself on exactly that point.
 *
 * THE REFRESH TOKEN DIES FIRST. It lasts one year; the tokens it renews last
 * three. A connection is therefore lost after twelve months, however healthy
 * its access token looks, unless it refreshes in time — so its own expiry is
 * kept, and is what decides when to refresh.
 */
final class ZidTokens
{
    /** Zid's documented lifetime for a refresh token. */
    public const REFRESH_TOKEN_DAYS = 365;

    private function __construct(
        public readonly string $authorization,
        public readonly string $accessToken,
        public readonly ?string $refreshToken,
        public readonly CarbonImmutable $expiresAt,
        public readonly CarbonImmutable $refreshExpiresAt,
    ) {}

    /** @param array<string, mixed> $data */
    public static function fromPayload(array $data): self
    {
        $authorization = $data['authorization'] ?? null;
        $accessToken = $data['access_token'] ?? null;

        if (! is_string($authorization) || $authorization === '' || ! is_string($accessToken) || $accessToken === '') {
            /*
             * Both or nothing. A store holding one of the two can call
             * nothing at all, and saving half a set would look like a
             * working connection until the first request.
             */
            throw new RuntimeException('Zid sent an incomplete set of tokens.');
        }

        $refresh = $data['refresh_token'] ?? null;
        $seconds = is_numeric($data['expires_in'] ?? null) ? (int) $data['expires_in'] : 0;
        $now = CarbonImmutable::now();

        return new self(
            authorization: $authorization,
            accessToken: $accessToken,
            refreshToken: is_string($refresh) && $refresh !== '' ? $refresh : null,
            // Nothing said is treated as expired, so the next call refreshes
            // rather than sending a dead token.
            expiresAt: $seconds > 0 ? $now->addSeconds($seconds) : $now,
            refreshExpiresAt: $now->addDays(self::REFRESH_TOKEN_DAYS),
        );
    }

    /** @return array<string, mixed> */
    public function toAttributes(): array
    {
        return [
            'authorization_token' => $this->authorization,
            'access_token' => $this->accessToken,
            'refresh_token' => $this->refreshToken,
            'token_expires_at' => $this->expiresAt,
            'refresh_token_expires_at' => $this->refreshToken !== null ? $this->refreshExpiresAt : null,
        ];
    }
}
