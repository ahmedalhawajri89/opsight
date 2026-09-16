<?php

declare(strict_types=1);

/*
|--------------------------------------------------------------------------
| Cross-Origin Resource Sharing (CORS)
|--------------------------------------------------------------------------
|
| Credentialed requests (cookies) are incompatible with a wildcard origin, so
| the allowlist is explicit and comes from configuration. Production never
| includes a localhost origin (SECURITY.md §3).
|
*/

return [

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_filter(
        array_map('trim', explode(',', (string) env('FRONTEND_URL', 'http://localhost:3000')))
    ),

    'allowed_origins_patterns' => [],

    'allowed_headers' => [
        'Accept',
        'Authorization',
        'Content-Type',
        'X-Requested-With',
        'X-XSRF-TOKEN',
    ],

    'exposed_headers' => ['Retry-After'],

    'max_age' => 0,

    // Required for the session cookie to be sent and accepted cross-origin.
    'supports_credentials' => true,

];
