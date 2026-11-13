<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The client's address, as the frontend saw it.
 *
 * On the hosted deployment every browser request reaches this API through
 * the frontend's rewrite (`/api/v1/*` on the frontend's own host). So the
 * connection this API sees comes from the frontend's platform, not from the
 * reader, and every limiter keyed by address — sign-in, sign-up, password
 * reset — would put the whole internet in one bucket: ten failed sign-ins a
 * minute, anywhere, and nobody could sign in.
 *
 * The frontend's `proxy.js` therefore passes the address it received (which
 * its platform sets itself and does not take from the client) in
 * `X-Baydar-Client-Ip`, with a secret shared by the two deployments in
 * `X-Baydar-Proxy-Secret`. Only when that secret matches is the address
 * believed. A request sent straight to the API cannot know the secret, so it
 * cannot choose its own address — which is the difference from trusting
 * `X-Forwarded-For` from anyone (`TRUSTED_PROXIES=*`).
 *
 * With no `PROXY_SECRET` configured (local development, or an API reached
 * directly) this does nothing.
 */
final class TrustFrontendProxy
{
    public const IP_HEADER = 'X-Baydar-Client-Ip';

    public const SECRET_HEADER = 'X-Baydar-Proxy-Secret';

    public function handle(Request $request, Closure $next): Response
    {
        $secret = (string) config('app.proxy_secret');
        $given = (string) $request->headers->get(self::SECRET_HEADER, '');
        $address = trim((string) $request->headers->get(self::IP_HEADER, ''));

        // Never left for anything later to read, believed or not.
        $request->headers->remove(self::SECRET_HEADER);
        $request->headers->remove(self::IP_HEADER);

        if (
            $secret !== ''
            && $given !== ''
            && hash_equals($secret, $given)
            && filter_var($address, FILTER_VALIDATE_IP) !== false
        ) {
            /*
             * The address becomes the connection's own, and the forwarding
             * headers go: with TRUSTED_PROXIES set, `ip()` would otherwise
             * still prefer X-Forwarded-For, which here names the frontend.
             */
            $request->server->set('REMOTE_ADDR', $address);

            foreach (['X-Forwarded-For', 'X-Real-Ip', 'Forwarded'] as $header) {
                $request->headers->remove($header);
            }
        }

        return $next($request);
    }
}
