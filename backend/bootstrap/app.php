<?php

declare(strict_types=1);

use App\Http\Middleware\EnsureUserIsActive;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\SetLocale;
use App\Support\DomainException;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\Middleware\AddLinkHeadersForPreloadedAssets;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Symfony\Component\HttpKernel\Exception\NotFoundHttpException;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        /*
         * Sanctum SPA (stateful cookie) mode — ADR-002.
         *
         * EnsureFrontendRequestsAreStateful puts the API group behind the web
         * middleware stack (session, cookie encryption, CSRF) for requests
         * originating from a configured stateful domain. That is what lets the
         * SPA authenticate with an HttpOnly cookie instead of a token held in
         * JavaScript.
         */
        $middleware->api(prepend: [
            EnsureFrontendRequestsAreStateful::class,
        ]);

        // After the stateful middleware, so the session — and with it the
        // signed-in user's saved language — is available when it runs.
        $middleware->api(append: [
            SetLocale::class,
        ]);

        // On every response, including the one Blade route.
        $middleware->append(SecurityHeaders::class);

        /*
         * Behind a load balancer or a CDN, the client's address is in
         * X-Forwarded-For and `$request->ip()` is the proxy's. Every limiter
         * keyed by address — sign-in, sign-up, health — would then share one
         * bucket for the entire internet, and the audit log would record the
         * proxy as the origin of every action. TRUSTED_PROXIES names the hops
         * that may set the header; with none set, nothing is trusted, which is
         * correct for running the API directly.
         */
        $proxies = array_values(array_filter(array_map('trim', explode(',', (string) env('TRUSTED_PROXIES', '')))));

        if ($proxies !== []) {
            $middleware->trustProxies(at: $proxies === ['*'] ? '*' : $proxies);
        }

        $middleware->alias([
            'active' => EnsureUserIsActive::class,
        ]);

        $middleware->removeFromGroup('web', AddLinkHeadersForPreloadedAssets::class);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        /*
         * One error contract for the whole API (ARCHITECTURE.md §4).
         *
         * Every failure becomes { message, code, errors? }. The client branches
         * on `code`, never on a human-readable message.
         */
        $exceptions->shouldRenderJsonWhen(
            static fn (Request $request): bool => $request->is('api/*') || $request->expectsJson()
        );

        $exceptions->render(function (Throwable $e, Request $request) {
            if (! ($request->is('api/*') || $request->expectsJson())) {
                return null;
            }

            /*
             * An exception that arrives with its response already built is
             * rendered as built — Laravel's own convention. It is how the login
             * throttle attaches `Retry-After` to a refusal that is a
             * ValidationException, which has no headers of its own.
             */
            if ($e instanceof ValidationException && $e->response !== null) {
                return $e->response;
            }

            [$status, $code, $message] = match (true) {
                $e instanceof ValidationException => [
                    $e->status,
                    'validation.failed',
                    $e->getMessage(),
                ],
                $e instanceof AuthenticationException => [
                    401,
                    'auth.unauthenticated',
                    __('errors.http.unauthenticated'),
                ],
                /*
                 * The status check is not redundant, for the same reason as
                 * CSRF below: Laravel converts AuthorizationException into a
                 * plain 403 HttpException before this handler runs, so matching
                 * only on the class would never fire and every 403 would fall
                 * through to the generic http.error code.
                 */
                $e instanceof AuthorizationException,
                $e instanceof HttpExceptionInterface && $e->getStatusCode() === 403 => [
                    403,
                    'auth.forbidden',
                    __('errors.http.forbidden'),
                ],
                /*
                 * A violated business rule — an illegal order transition,
                 * insufficient stock. The request was well-formed but what it
                 * asked for is not legal in the current state, so it is a 409:
                 * retrying the same payload will never succeed.
                 */
                $e instanceof DomainException => [
                    $e->status,
                    $e->errorCode,
                    $e->getMessage(),
                ],
                $e instanceof ModelNotFoundException,
                $e instanceof NotFoundHttpException => [
                    404,
                    'resource.not_found',
                    __('errors.http.not_found'),
                ],
                $e instanceof ThrottleRequestsException => [
                    429,
                    'rate_limit.exceeded',
                    __('errors.http.rate_limited'),
                ],
                /*
                 * CSRF gets its own code so the client can refresh the token and
                 * retry once, rather than showing the user an error it could
                 * have resolved itself.
                 *
                 * The status check is not redundant: Laravel converts
                 * TokenMismatchException into a plain 419 HttpException before
                 * this handler runs, so matching only on the class would never
                 * fire and the code would silently fall through to http.error.
                 */
                $e instanceof TokenMismatchException,
                $e instanceof HttpExceptionInterface && $e->getStatusCode() === 419 => [
                    419,
                    'csrf.token_mismatch',
                    __('errors.http.csrf'),
                ],
                $e instanceof HttpExceptionInterface => [
                    $e->getStatusCode(),
                    'http.error',
                    $e->getMessage(),
                ],
                default => [
                    500,
                    'server.error',
                    __('errors.http.server'),
                ],
            };

            $payload = [
                'message' => $message,
                'code' => $code,
            ];

            if ($e instanceof ValidationException) {
                $payload['errors'] = $e->errors();
            }

            /*
             * A 500 returns a reference id and nothing else. The detail goes to
             * the log; SQL, file paths and stack traces are never returned
             * (SECURITY.md §11). In local development the detail is included,
             * because debugging a blank 500 is its own problem.
             */
            if ($status === 500) {
                $payload['reference'] = (string) str()->uuid();

                logger()->error('Unhandled API exception', [
                    'reference' => $payload['reference'],
                    'exception' => $e,
                ]);

                if (config('app.debug')) {
                    $payload['debug'] = [
                        'exception' => $e::class,
                        'message' => $e->getMessage(),
                        'file' => $e->getFile().':'.$e->getLine(),
                    ];
                }
            }

            /*
             * Carry the exception's own headers across. Building a fresh JSON
             * response otherwise drops them — most importantly `Retry-After`
             * on a 429, which SECURITY.md §7 requires and which is the only
             * way a client can tell a five-second wait from a fifty-minute one.
             */
            $headers = $e instanceof HttpExceptionInterface ? $e->getHeaders() : [];

            return response()->json($payload, $status, $headers);
        });
    })->create();
