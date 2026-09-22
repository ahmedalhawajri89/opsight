<?php

declare(strict_types=1);

namespace Tests;

use App\Models\Business;
use App\Models\BusinessSetting;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        /*
         * Every test request carries the SPA's Origin header.
         *
         * This is what makes Sanctum's EnsureFrontendRequestsAreStateful treat
         * the request as stateful and run it through the web middleware group,
         * giving it a session. Without it the suite would silently exercise a
         * stateless token path that the application never actually uses in
         * production — tests would pass while the real cookie flow stayed
         * untested, which is the failure mode Phase 01 exists to prevent.
         */
        $this->withHeader('Origin', (string) config('app.frontend_url'));

        /*
         * The settings singleton must exist before anything reads a timezone
         * from it, and its cache must not leak between tests — a test that
         * changes the fiscal year would otherwise poison every later one.
         */
        BusinessSetting::flushCache();

        /*
         * Every test runs as a business, as every signed-in request does. A
         * test about isolation creates a second one and switches with
         * CurrentBusiness::run() (ADR-023).
         */
        $business = Business::query()->firstOrCreate(['slug' => 'opsight-test'], ['name' => 'Opsight Test']);
        CurrentBusiness::get()->set($business->id);

        BusinessSetting::ensureExists(['company_name' => 'Opsight Test']);
    }

    /**
     * Simulate the next HTTP request arriving at a fresh worker.
     *
     * Laravel keeps one container for the whole test, so the auth guards cache
     * the resolved user across requests — Sanctum's RequestGuard in particular.
     * In production every request gets a fresh container, so that cache never
     * spans requests.
     *
     * Without this, a test cannot tell a working logout from a broken one: the
     * stale in-memory user would answer the next call regardless of whether the
     * session was actually destroyed. Forgetting the guards forces the next
     * request to re-resolve identity from the session cookie, which is what
     * production does and therefore what the test should measure.
     */
    protected function asNewRequest(): static
    {
        $this->app['auth']->forgetGuards();

        return $this;
    }
}
