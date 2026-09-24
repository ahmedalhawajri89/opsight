<?php

declare(strict_types=1);

namespace App\Providers;

use App\Listeners\RecordAuthActivity;
use App\Models\User;
use App\Support\Localization\Localizer;
use App\Support\Tenancy\BusinessAgnosticUserProvider;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Auth\Events\Authenticated;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;
use Illuminate\Validation\Rules\Password;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        /*
         * One Localizer per request. A singleton would carry one user's
         * language into the next request on a long-lived worker (Octane, a
         * queue daemon); scoped instances are flushed between them.
         */
        $this->app->scoped(Localizer::class);

        // Scoped for the same reason: a worker must never start a request or
        // a job still acting for the previous one's business (ADR-023).
        $this->app->scoped(CurrentBusiness::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        /*
         * Auth auditing, registered explicitly rather than by discovery.
         *
         * Laravel can find listeners by convention, but a security control
         * that is wired up invisibly is one nobody can confirm is wired up.
         * Four lines in a file that is read on every boot is the cheapest
         * possible way to make "is login audited?" answerable by looking.
         */
        Event::listen(Login::class, [RecordAuthActivity::class, 'handleLogin']);
        Event::listen(Logout::class, [RecordAuthActivity::class, 'handleLogout']);
        Event::listen(Failed::class, [RecordAuthActivity::class, 'handleFailed']);
        Event::listen(Lockout::class, [RecordAuthActivity::class, 'handleLockout']);

        /*
         * The business comes from the signed-in user, set the moment the guard
         * resolves them: from the session, at sign-in, or by actingAs() in a
         * test. That is before route model binding, so {order} is looked up
         * inside the right business from the start (ADR-023).
         */
        Auth::provider('business-agnostic', static fn ($app, array $config): BusinessAgnosticUserProvider => new BusinessAgnosticUserProvider($app['hash'], $config['model']));

        Event::listen(Authenticated::class, static function (Authenticated $event): void {
            if ($event->user instanceof User) {
                CurrentBusiness::get()->set($event->user->business_id);
            }
        });

        $this->definePasswordPolicy();
        $this->defineRateLimits();
    }

    /**
     * SECURITY.md §7, as NAMED limiters — and the naming is the fix, not style.
     *
     * The routes used to say `throttle:120,1`, `throttle:10,60` and so on.
     * Laravel keys an unnamed throttle on the user's id alone, so nested
     * throttles shared ONE counter: the export group sits inside the general
     * API group, and a user who had made ten ordinary requests was refused
     * their first export of the day, while each export spent the counter
     * twice. The limits in the documentation were not the limits in force, and
     * nothing errored. A named limiter prefixes its key with its name, so each
     * budget below is genuinely its own.
     *
     * RateLimitIsolationTest pins this down.
     */
    private function defineRateLimits(): void
    {
        $byUser = static fn (Request $request): string => (string) ($request->user()?->getAuthIdentifier() ?? $request->ip());

        RateLimiter::for('api', static fn (Request $request): Limit => Limit::perMinute(120)->by($byUser($request)));

        // Aggregation is the most expensive work the system does.
        RateLimiter::for('analytics', static fn (Request $request): Limit => Limit::perMinute(60)->by($byUser($request)));

        // Bulk extraction is the exfiltration vector.
        RateLimiter::for('exports', static fn (Request $request): Limit => Limit::perHour(10)->by($byUser($request)));

        // A coarse per-address backstop; LoginRequest owns the real 5/min
        // per email-and-address limit.
        RateLimiter::for('login', static fn (Request $request): Limit => Limit::perMinute(10)->by((string) $request->ip()));

        // Each sign-up creates a business: a handful an hour from one address.
        RateLimiter::for('register', static fn (Request $request): Limit => Limit::perHour(5)->by((string) $request->ip()));

        // Changing one's own password: a few tries a minute, then wait.
        RateLimiter::for('password', static fn (Request $request): Limit => Limit::perMinute(5)->by($byUser($request)));

        RateLimiter::for('health', static fn (Request $request): Limit => Limit::perMinute(30)->by((string) $request->ip()));
    }

    /**
     * SECURITY.md §3: twelve characters minimum, checked against a breach
     * corpus. No composition rules — length and breach-checking outperform
     * "one symbol required", which mostly produces `Password1!`.
     *
     * `uncompromised()` is skipped under `testing` because it calls the Have I
     * Been Pwned range API over the network. A test suite that makes outbound
     * HTTP requests is slow, fails on a train, and would be asserting
     * somebody else's uptime rather than this application's behaviour. The
     * length rule still applies in tests, so the shape of the policy is
     * exercised; only the network half is stubbed out.
     */
    private function definePasswordPolicy(): void
    {
        Password::defaults(function (): Password {
            $rule = Password::min(12);

            return $this->app->environment('testing') ? $rule : $rule->uncompromised();
        });
    }
}
