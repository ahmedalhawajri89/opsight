<?php

declare(strict_types=1);

namespace App\Http\Requests\Auth;

use Illuminate\Auth\Events\Lockout;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class LoginRequest extends FormRequest
{
    /**
     * Failed attempts allowed before the throttle engages.
     * SECURITY.md §7: 5 per minute, per IP *and* per email.
     */
    private const MAX_ATTEMPTS = 5;

    private const DECAY_SECONDS = 60;

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

        if (! Auth::attempt($credentials, remember: false)) {
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

        throw ValidationException::withMessages([
            'email' => __('auth.throttle', [
                'seconds' => $seconds,
                'minutes' => ceil($seconds / 60),
            ]),
        ])->status(429);
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
