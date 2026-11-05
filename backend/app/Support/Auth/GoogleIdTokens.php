<?php

declare(strict_types=1);

namespace App\Support\Auth;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;

/**
 * Checks an ID token issued by Google Identity Services, and says whose it is.
 *
 * WHY GOOGLE'S OWN ENDPOINT AND NOT A JWT LIBRARY. Verifying the signature
 * locally needs Google's rotating public keys, a cache for them and a JOSE
 * library to read them: a dependency and a key-rotation bug waiting to happen,
 * for a request that happens once per sign-in. `tokeninfo` does the signature
 * and expiry check on Google's side. What it does NOT do is check that the
 * token was issued to THIS application, so the audience is checked here, as
 * are the issuer and that Google has verified the address.
 *
 * Returns the verified address, lower-cased, or null for anything else: a
 * forged token, an expired one, one minted for another application, an
 * unverified address, or Google being unreachable.
 */
final class GoogleIdTokens
{
    private const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo';

    private const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

    public function __construct(private readonly ?string $clientId) {}

    public function enabled(): bool
    {
        return $this->clientId !== null && $this->clientId !== '';
    }

    public function verifiedEmail(string $credential): ?string
    {
        if (! $this->enabled()) {
            return null;
        }

        try {
            $response = Http::timeout(5)->acceptJson()->get(self::TOKENINFO, ['id_token' => $credential]);
        } catch (ConnectionException) {
            return null;
        }

        if (! $response->successful()) {
            return null;
        }

        /** @var array<string, mixed> $claims */
        $claims = $response->json() ?? [];

        $verified = ($claims['email_verified'] ?? null) === true || ($claims['email_verified'] ?? null) === 'true';

        if (($claims['aud'] ?? null) !== $this->clientId
            || ! in_array($claims['iss'] ?? null, self::ISSUERS, true)
            || (int) ($claims['exp'] ?? 0) <= time()
            || ! $verified
            || ! is_string($claims['email'] ?? null)) {
            return null;
        }

        return strtolower($claims['email']);
    }
}
