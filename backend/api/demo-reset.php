<?php

declare(strict_types=1);
use Illuminate\Contracts\Console\Kernel;

/*
 * The demo's nightly reset on Vercel (docs/DEPLOYMENT.md). There is no
 * scheduler there, so a Vercel Cron Job calls this path once a day
 * (vercel.json › crons) and it runs `demo:reset`: the snapshot comes back and
 * its dates move up to this week.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>`. A request without it, or
 * with another value, is refused, so no visitor can wipe what another one is
 * trying out.
 */

$secret = getenv('CRON_SECRET') ?: '';

if ($secret === '' || ! hash_equals("Bearer {$secret}", $_SERVER['HTTP_AUTHORIZATION'] ?? '')) {
    http_response_code(401);
    exit;
}

require __DIR__.'/_runtime.php';
require __DIR__.'/../vendor/autoload.php';

$app = require __DIR__.'/../bootstrap/app.php';
$kernel = $app->make(Kernel::class);

$status = $kernel->call('demo:reset');

http_response_code($status === 0 ? 200 : 500);
header('Content-Type: text/plain; charset=utf-8');
echo trim($kernel->output()), "\n";
