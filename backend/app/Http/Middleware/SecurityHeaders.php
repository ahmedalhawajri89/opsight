<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * The headers every response carries, whatever it is.
 *
 * This is a JSON API with one Blade route, so a content policy has little to
 * bite on — but the three below do real work even here:
 *
 *   - `nosniff` stops a browser guessing that a JSON error page is HTML and
 *     rendering it, which is how a reflected payload becomes script;
 *   - `DENY` on framing removes clickjacking of the one HTML route;
 *   - a referrer policy keeps a customer id in a URL from being sent to
 *     whatever a user opens next.
 *
 * HSTS is only sent over HTTPS: sending it from a plain-HTTP development
 * server would pin a browser to a scheme that is not being served.
 */
class SecurityHeaders
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);

        /*
         * PHP announces itself and its version (expose_php) at the SAPI level,
         * outside the Response object, so it is removed there as well as here.
         */
        $response->headers->remove('X-Powered-By');

        if (! headers_sent()) {
            header_remove('X-Powered-By');
        }

        $response->headers->set('X-Content-Type-Options', 'nosniff');
        $response->headers->set('X-Frame-Options', 'DENY');
        $response->headers->set('Referrer-Policy', 'strict-origin-when-cross-origin');
        // Nothing here uses a camera, a microphone or a location.
        $response->headers->set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');

        if ($request->secure()) {
            $response->headers->set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        }

        return $response;
    }
}
