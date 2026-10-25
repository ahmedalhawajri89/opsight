<?php

declare(strict_types=1);

/*
 * Shared start-up for the Vercel functions (index.php, demo-reset.php),
 * docs/DEPLOYMENT.md.
 *
 * The disk is read-only except /tmp, so storage and Laravel's compiled caches
 * are moved there. Nothing in them needs to outlive a warm instance: sessions
 * live in the cookie and the cache in the database.
 */

$storage = '/tmp/storage';

foreach (['app', 'framework/cache/data', 'framework/sessions', 'framework/views', 'logs'] as $dir) {
    if (! is_dir("{$storage}/{$dir}")) {
        mkdir("{$storage}/{$dir}", 0777, true);
    }
}

$paths = [
    'LARAVEL_STORAGE_PATH' => $storage,
    'VIEW_COMPILED_PATH' => "{$storage}/framework/views",
    'APP_CONFIG_CACHE' => '/tmp/config.php',
    'APP_EVENTS_CACHE' => '/tmp/events.php',
    'APP_PACKAGES_CACHE' => '/tmp/packages.php',
    'APP_ROUTES_CACHE' => '/tmp/routes.php',
    'APP_SERVICES_CACHE' => '/tmp/services.php',
];

foreach ($paths as $key => $value) {
    putenv("{$key}={$value}");
    $_ENV[$key] = $_SERVER[$key] = $value;
}

// Vercel always serves HTTPS and hands PHP the request through its own proxy:
// without this, URLs would be built with http and secure cookies refused.
$_SERVER['HTTPS'] = 'on';
