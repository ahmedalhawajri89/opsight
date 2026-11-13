<?php

declare(strict_types=1);

namespace App\Providers;

use Anthropic\Client as AnthropicClient;
use App\Domain\Assistant\ClaudeModel;
use App\Domain\Assistant\LanguageModel;
use App\Listeners\RecordAuthActivity;
use App\Models\User;
use App\Support\Auth\GoogleIdTokens;
use App\Support\Localization\Localizer;
use App\Support\Tenancy\BusinessAgnosticUserProvider;
use App\Support\Tenancy\CurrentBusiness;
use Closure;
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
         * Ask Baydar's model (ADR-038). Bound to the interface so tests script
         * the model instead of calling Anthropic, and resolved lazily so an
         * installation without a key never constructs a client.
         */
        $this->app->bind(LanguageModel::class, static fn (): ClaudeModel => new ClaudeModel(
            new AnthropicClient(apiKey: (string) config('assistant.api_key')),
        ));

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
        $this->app->singleton(GoogleIdTokens::class, static fn (): GoogleIdTokens => new GoogleIdTokens(
            config('services.google.client_id') !== null ? (string) config('services.google.client_id') : null,
        ));

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

        /*
         * File imports (ADR-039): a preview, a check and a write per attempt,
         * and an owner fixing a file goes round that loop a few times — so
         * more generous than exports, still far short of a script.
         */
        RateLimiter::for('brief-test', static fn (Request $request): Limit => Limit::perHour(5)->by($byUser($request)));

        RateLimiter::for('assistant', static fn (Request $request): Limit => Limit::perMinute(10)->by($byUser($request)));

        RateLimiter::for('imports', static fn (Request $request): Limit => Limit::perHour(60)->by($byUser($request)));

        /*
         * A coarse per-address backstop; LoginRequest owns the real 5/min
         * per email-and-address limit, and clears it on a success.
         *
         * THIS ONE COUNTS SUCCESSES TOO, which is the point in production —
         * somebody spraying a stolen password list gets some of them right,
         * and the per-email limit never sees a pattern because each guess is
         * against a different account.
         *
         * Locally it measures nothing. Every request comes from 127.0.0.1:
         * the developer, the browser suite's four sign-ins, and any script
         * run beside them share one bucket, so ten a minute is reached by
         * ordinary work rather than by an attack. It cost three false runs
         * of the suite before it was named — each one a cascade, because a
         * failed auth setup leaves every authenticated test looking at the
         * sign-in page with no navigation on it.
         *
         * Raised rather than removed in local: a runaway loop should still
         * meet a wall.
         */
        /*
         * Per address AND per account. The address stops one machine sweeping
         * many accounts; the account limit stops many machines (or many
         * addresses) taking turns at one, which a per-address limit alone
         * never counts together. Thirty an hour is far above anyone who has
         * merely forgotten their password and far below a guessing campaign.
         */
        RateLimiter::for('login', static fn (Request $request): array => app()->isLocal()
            ? [Limit::perMinute(120)->by('ip:'.$request->ip())]
            : [
                Limit::perMinute(10)->by('ip:'.$request->ip()),
                Limit::perHour(30)->by('email:'.strtolower(trim((string) $request->input('email')))),
            ]);

        // Each sign-up creates a business: a handful an hour from one address.
        RateLimiter::for('register', static fn (Request $request): Limit => Limit::perHour(5)->by((string) $request->ip()));

        // Opening the link in a confirmation email; the signature is the lock.
        RateLimiter::for('verify-email', static fn (Request $request): Limit => Limit::perMinute(10)->by('ip:'.$request->ip()));

        // Asking for another confirmation email: an inbox is not a target.
        RateLimiter::for('verify-email-send', static fn (Request $request): Limit => Limit::perHour(5)->by($byUser($request)));

        // A code to a WhatsApp number costs money and lands on a phone: a few an hour.
        RateLimiter::for('whatsapp-code', static fn (Request $request): Limit => Limit::perHour(3)->by($byUser($request)));

        // Typing the code back; the code itself also dies after five wrong tries.
        RateLimiter::for('whatsapp-verify', static fn (Request $request): Limit => Limit::perHour(10)->by($byUser($request)));

        // Changing one's own password: a few tries a minute, then wait.
        RateLimiter::for('password', static fn (Request $request): Limit => Limit::perMinute(5)->by($byUser($request)));

        /*
         * A forgotten password, asked for or used. Per address AND per email:
         * the address stops one machine sweeping many inboxes, the email stops
         * many machines flooding one. The broker adds its own one request a
         * minute per account on top.
         */
        RateLimiter::for('password-reset', static fn (Request $request): array => [
            Limit::perMinute(5)->by('ip:'.$request->ip()),
            Limit::perHour(10)->by('email:'.strtolower((string) $request->input('email'))),
        ]);

        /*
         * Claiming a store, which accepts an identifier rather than a secret.
         * Ten an hour is far more than an owner connecting their own shop
         * ever needs, and far too few to find a pending store by trying ids
         * inside the hour one is claimable.
         */
        RateLimiter::for('integration-claim', static fn (Request $request): Limit => Limit::perHour(10)->by($byUser($request)));

        RateLimiter::for('health', static fn (Request $request): Limit => Limit::perMinute(30)->by((string) $request->ip()));

        /*
         * Webhook deliveries (ADR-027), counted per provider and address.
         *
         * Generous on purpose: a busy store legitimately bursts — one sale,
         * forty order events — and a provider that gets a 429 simply retries,
         * which costs more than letting it through. This is a ceiling against
         * a flood, not a traffic policy.
         */
        // Per key, not per address: a merchant's whole catalogue may be sent
        // from one Zapier IP, and two merchants may share it.
        RateLimiter::for('inbound', static fn (Request $request): Limit => Limit::perMinute(240)
            ->by('inbound|'.substr((string) $request->bearerToken(), 0, 13).'|'.$request->ip()));
        RateLimiter::for('webhooks', static fn (Request $request): Limit => Limit::perMinute(300)
            ->by($request->route('provider').'|'.$request->ip()));
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
    /** Bcrypt's own limit: it reads no further than this. */
    public const PASSWORD_MAX_BYTES = 72;

    private function definePasswordPolicy(): void
    {
        Password::defaults(function (): Password {
            /*
             * At most 72 BYTES (security audit, 2026-11-13). Bcrypt reads no
             * further and silently ignores the rest, so a 100-character
             * passphrase was really its first 72 bytes — and two passphrases
             * sharing those were the same password. Bytes, not characters:
             * an Arabic letter is two bytes in UTF-8, so the limit is about
             * 36 Arabic letters, and saying so beats truncating in silence.
             */
            $rule = Password::min(12)->rules([
                static function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && strlen($value) > self::PASSWORD_MAX_BYTES) {
                        $fail(__('validation.password_too_long'));
                    }
                },
            ]);

            return $this->app->environment('testing') ? $rule : $rule->uncompromised();
        });
    }
}
