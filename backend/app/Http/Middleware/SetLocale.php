<?php

declare(strict_types=1);

namespace App\Http\Middleware;

use App\Models\User;
use App\Support\Localization\Localizer;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Chooses the language the server writes in, for this request.
 *
 * Precedence:
 *   1. The signed-in user's saved preference. It is the authority: a user who
 *      chose Arabic gets Arabic from every endpoint, whatever the browser says.
 *   2. The request's Accept-Language, for requests with no user — the sign-in
 *      screen, whose validation and throttle messages must match the language
 *      the visitor is reading it in. The client sends its active language.
 *   3. English.
 *
 * Only languages the application actually has are accepted. An unsupported
 * Accept-Language falls through to English rather than to Laravel's own
 * fallback behaviour for a missing locale, which would mix languages.
 */
class SetLocale
{
    public function __construct(private readonly Localizer $localizer) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = Auth::guard('sanctum')->user();

        if ($user instanceof User) {
            $this->localizer->use($user->locale ?? 'en', $user->numerals ?? 'latn');
        } else {
            $this->localizer->use($this->fromHeader($request), 'latn');
        }

        $response = $next($request);

        // Tells caches and clients which language the body is in, so a proxy
        // cannot serve an Arabic error body to an English reader.
        $response->headers->set('Content-Language', $this->localizer->locale());

        return $response;
    }

    private function fromHeader(Request $request): string
    {
        $preferred = $request->getPreferredLanguage(Localizer::LOCALES);

        return is_string($preferred) ? $preferred : 'en';
    }
}
