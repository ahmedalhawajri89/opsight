<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Auth\Events\Lockout;
use Illuminate\Auth\SessionGuard;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;
use LogicException;

class LoginRequest extends FormRequest
{
    /**
     * Failed attempts allowed before the throttle engages.
     * SECURITY.md §7: 5 per minute, per IP *and* per email.
     */
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 60;

    /**
     * How long "remember me" keeps a device signed in: 30 days.
     *
     * Laravel's own default is five years, which is not a remembered device,
     * it is a device nobody remembers is signed in. Without the box ticked the
     * session lasts SESSION_LIFETIME (eight hours of inactivity) as before.
     */
    private const REMEMBER_MINUTES = 60 * 24 * 30;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, mixed>>
     */
    public function rules(): array
    {
        return [
            'email' => ['required', 'string', 'email', 'max:190'],
            'password' => ['required', 'string'],
            'remember' => ['sometimes', 'boolean'],
        ];
    }

    /**
     * Attempt authentication, or throw a validation exception.
     *
     * Note what this deliberately does NOT do: distinguish between an unknown
     * email and a wrong password. Both produce the identical message, status
     * and code, because distinguishing them turns the login form into a user
     * enumeration endpoint (SECURITY.md §7).
     */
    public function authenticate(): void
    {
        $this->ensureIsNotRateLimited();

        $credentials = [
            'email' => (string) $this->string('email'),
            'password' => (string) $this->string('password'),
            // A deactivated user cannot authenticate at all. Checking it here
            // rather than after login means the failure is indistinguishable
            // from a wrong password, which is the desired behaviour.
            'is_active' => true,
        ];

        $guard = Auth::guard('web');

        // Only the session guard has a recaller to size. Anything else here is
        // a configuration change that would silently restore Laravel's
        // five-year default, so it stops sign-in rather than slipping through.
        if (! $guard instanceof SessionGuard) {
            throw new LogicException('The web guard must be a SessionGuard for remember-me to be bounded.');
        }

        $guard->setRememberDuration(self::REMEMBER_MINUTES);

        if (! $guard->attempt($credentials, remember: $this->boolean('remember'))) {
            RateLimiter::hit($this->throttleKey(), self::DECAY_SECONDS);

            throw ValidationException::withMessages([
                'email' => __('auth.failed'),
            ]);
        }

        RateLimiter::clear($this->throttleKey());
    }

    public function ensureIsNotRateLimited(): void
    {
        if (! RateLimiter::tooManyAttempts($this->throttleKey(), self::MAX_ATTEMPTS)) {
            return;
        }

        Event::dispatch(new Lockout($this));

        $seconds = RateLimiter::availableIn($this->throttleKey());

        $exception = ValidationException::withMessages([
            'email' => __('auth.throttle', [
                'seconds' => $seconds,
                'minutes' => ceil($seconds / 60),
            ]),
        ])->status(429);

        /*
         * A ValidationException carries no headers, so `Retry-After` is
         * attached to the response it renders instead. SECURITY.md §7 requires
         * it on every 429, and the field message alone is not machine-readable.
         */
        $exception->response = response()->json([
            'message' => $exception->getMessage(),
            'code' => 'auth.throttled',
            'errors' => $exception->errors(),
        ], 429, ['Retry-After' => (string) $seconds]);

        throw $exception;
    }

    /**
     * Keyed on email *and* IP, so the limit blocks both brute force against
     * one account and spraying from one source.
     */
    public function throttleKey(): string
    {
        return Str::transliterate(
            Str::lower((string) $this->string('email')).'|'.$this->ip()
        );
    }
}
