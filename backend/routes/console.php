<?php

declare(strict_types=1);

use App\Console\Commands\PruneActivityLogCommand;
use App\Console\Commands\PruneUnclaimedIntegrations;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * The project's first scheduled task (ADR-026).
 *
 * Here rather than in bootstrap/app.php's withSchedule(), so this file is the
 * one place that answers "what does this application do without a request?".
 *
 * 03:15 is off-peak in Asia/Bahrain and deliberately not on the hour, where
 * every other cron in the world already is. withoutOverlapping() because a
 * first run on an old installation can be slow and must not be re-entered;
 * onOneServer() because two instances would race. Both are backed by
 * cache_locks on the database store, which already exists.
 *
 * Deployment needs one real cron entry for any of this to happen:
 *   * * * * * php artisan schedule:run
 * Without it nothing errors — the audit log simply keeps growing (SETUP.md).
 */
Schedule::command(PruneActivityLogCommand::class)
    ->dailyAt('03:15')
    ->withoutOverlapping()
    ->onOneServer();

/*
 * Store tokens nobody claimed, discarded.
 *
 * Hourly rather than nightly, because the window they are usable for is one
 * hour: a nightly sweep would leave a dead key lying in the table for most
 * of a day. This is the sweep that makes the window a fact rather than a
 * rule — and it is cheap, since in the normal case it deletes nothing.
 */
Schedule::command(PruneUnclaimedIntegrations::class)
    ->hourly()
    ->withoutOverlapping()
    ->onOneServer();
