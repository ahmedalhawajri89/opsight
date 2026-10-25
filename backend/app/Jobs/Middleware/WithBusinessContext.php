<?php

declare(strict_types=1);

namespace App\Jobs\Middleware;

use App\Support\Tenancy\CurrentBusiness;
use App\Support\Tenancy\MissingBusinessContext;
use Closure;

/**
 * Runs a job as the business it was queued for (ADR-027).
 *
 * THIS IS THE PIECE THAT MAKES BACKGROUND WORK SAFE IN A SHARED DATABASE.
 *
 * Every read in this system is filtered by `CurrentBusiness`, and in a web
 * request that is set from the signed-in user. A queued job has no signed-in
 * user: it runs in a long-lived worker process that has just finished a job
 * for somebody else. Without this, a job either sees nothing — the scope
 * fails closed, which is the good outcome — or, worse, inherits whatever
 * business the previous job left behind.
 *
 * `CurrentBusiness` is container-scoped and Laravel flushes scoped instances
 * between jobs, so the inheritance case should not arise. "Should not" is not
 * a guarantee anyone can act on, which is why this sets the id explicitly and
 * a test queues a job for business B directly after a request for business A.
 *
 * The context is restored afterwards rather than cleared, so a job dispatched
 * synchronously from inside a request — `QUEUE_CONNECTION=sync` in tests, and
 * `dispatchSync` anywhere — leaves the caller's context exactly as it found
 * it.
 *
 * A job that reaches here with no business fails loudly. It must not run
 * "for everyone".
 */
class WithBusinessContext
{
    /**
     * @param  object{businessId: int|null}  $job
     */
    public function handle(object $job, Closure $next): mixed
    {
        $businessId = $job->businessId ?? null;

        if ($businessId === null) {
            throw MissingBusinessContext::make();
        }

        return CurrentBusiness::get()->run($businessId, static fn (): mixed => $next($job));
    }
}
