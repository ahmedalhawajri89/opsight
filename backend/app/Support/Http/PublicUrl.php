<?php

declare(strict_types=1);

namespace App\Support\Http;

/**
 * Whether a URL a user typed is safe for the server to fetch.
 *
 * WHY. Connecting a WooCommerce store means the SERVER requests an address
 * the owner wrote. Unchecked, that is a request forgery hole (SSRF): an
 * address of 127.0.0.1, 169.254.169.254 (a cloud's metadata service) or a
 * private range would let anyone with the integrations screen read the
 * server's own network through Baydar.
 *
 * So the URL must be https, name a host rather than a bare address in a
 * reserved range, and every address the host resolves to must be public.
 * The check is repeated on the address actually connected to by pinning it
 * (see pinnedOptions), so a name that resolves to a public address for the
 * check and a private one for the request (DNS rebinding) does not get
 * through.
 *
 * Plain http and private addresses are allowed only when relaxed() says
 * so: in the local environment, where a developer's test store runs on
 * localhost.
 */
final class PublicUrl
{
    /**
     * The normalised URL (scheme and host lower-cased, no trailing slash, no
     * query or fragment), or null when it may not be fetched.
     */
    public static function normalise(string $url): ?string
    {
        $url = trim($url);
        $parts = parse_url($url);

        if ($parts === false || ! isset($parts['scheme'], $parts['host'])) {
            return null;
        }

        $scheme = strtolower($parts['scheme']);
        $host = strtolower($parts['host']);
        $local = self::relaxed();

        if ($scheme !== 'https' && ! ($local && $scheme === 'http')) {
            return null;
        }

        if (isset($parts['user']) || isset($parts['pass'])) {
            return null;
        }

        if (! $local && self::resolvesPrivately($host)) {
            return null;
        }

        $port = isset($parts['port']) ? ':'.$parts['port'] : '';
        $path = rtrim($parts['path'] ?? '', '/');

        return "{$scheme}://{$host}{$port}{$path}";
    }

    /**
     * Guzzle options that connect to the address checked, not whatever the
     * name resolves to a moment later. Empty when relaxed; null, meaning DO
     * NOT SEND, when the host now resolves to nothing or to a private address.
     *
     * @return array<string, mixed>|null
     */
    public static function pinnedOptions(string $url): ?array
    {
        if (self::relaxed()) {
            return [];
        }

        $host = (string) parse_url($url, PHP_URL_HOST);
        $port = (int) (parse_url($url, PHP_URL_PORT) ?: 443);
        $addresses = self::addresses($host);

        if ($addresses === [] || self::anyPrivate($addresses)) {
            return null;
        }

        return [
            'curl' => [CURLOPT_RESOLVE => ["{$host}:{$port}:{$addresses[0]}"]],
            'allow_redirects' => false,
        ];
    }

    /**
     * Plain http and private addresses, for a developer's test store on
     * localhost. Off unless the environment is local or it is switched on.
     */
    private static function relaxed(): bool
    {
        return (bool) config('integrations.woocommerce.allow_private_hosts', app()->isLocal());
    }

    private static function resolvesPrivately(string $host): bool
    {
        $addresses = self::addresses($host);

        return $addresses === [] || self::anyPrivate($addresses);
    }

    /** @return list<string> */
    private static function addresses(string $host): array
    {
        $host = trim($host, '[]');

        if (filter_var($host, FILTER_VALIDATE_IP)) {
            return [$host];
        }

        $found = [];

        foreach (@dns_get_record($host, DNS_A | DNS_AAAA) ?: [] as $record) {
            $ip = $record['ip'] ?? $record['ipv6'] ?? null;

            if (is_string($ip)) {
                $found[] = $ip;
            }
        }

        return $found;
    }

    /** @param  list<string>  $addresses */
    private static function anyPrivate(array $addresses): bool
    {
        foreach ($addresses as $ip) {
            $public = filter_var(
                $ip,
                FILTER_VALIDATE_IP,
                FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE,
            );

            if ($public === false) {
                return true;
            }
        }

        return false;
    }
}
