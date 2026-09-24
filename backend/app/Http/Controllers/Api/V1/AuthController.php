<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Domain\Businesses\RegisterBusiness;
use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Requests\Auth\RegisterRequest;
use App\Http\Requests\Auth\UpdatePasswordRequest;
use App\Http\Requests\Auth\UpdatePreferencesRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\Localization\Localizer;
use Illuminate\Auth\SessionGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * Sanctum SPA (stateful cookie) authentication — ADR-002.
 *
 * No token is created or returned. The session lives in an HttpOnly cookie
 * that JavaScript cannot read, which is the entire point of the choice.
 */
class AuthController extends Controller
{
    public function login(LoginRequest $request, Localizer $localizer): JsonResponse
    {
        $request->authenticate();

        // Regenerate on login to defend against session fixation.
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        $user = $request->user();
        assert($user instanceof User);

        $user->forceFill(['last_login_at' => now()])->save();

        // The request began before anyone was signed in, so it is running in
        // the language of the sign-in screen. The response describes the user
        // (role label and so on), so it switches to the user's own language.
        $localizer->use($user->locale ?? 'en', $user->numerals ?? 'latn');

        return UserResource::make($user)
            ->response()
            ->setStatusCode(200);
    }

    /**
     * A new business signs itself up, and its owner is signed in (ADR-024).
     *
     * Rate-limited per address (the `register` limiter), because each call
     * creates a business. Saying that an email is already registered does tell
     * the caller an account exists; that is accepted here, as it is on every
     * sign-up form, and the limiter keeps it from becoming a bulk lookup.
     */
    public function register(RegisterRequest $request, RegisterBusiness $register, Localizer $localizer): JsonResponse
    {
        /** @var array{business_name: string, name: string, email: string, password: string, locale?: string|null} $data */
        $data = $request->validated();

        $user = $register($data);

        Auth::guard('web')->login($user);

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        $user->forceFill(['last_login_at' => now()])->save();
        $localizer->use($user->locale ?? 'en', $user->numerals ?? 'latn');

        return UserResource::make($user)
            ->response()
            ->setStatusCode(201);
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return response()->json(null, 204);
    }

    /**
     * The authenticated user and their resolved abilities.
     * The frontend calls this on mount to establish session state.
     */
    public function me(Request $request): UserResource
    {
        $user = $request->user();
        assert($user instanceof User);

        return UserResource::make($user);
    }

    /**
     * A user changing their own password.
     *
     * Until now only an Owner could change anyone's password, which left a
     * member of staff who suspects their password is known with no way to
     * change it — the one case where speed matters most.
     *
     * The current password is required, every remembered device is ended, and
     * this session stays signed in: the person who just proved who they are
     * should not be thrown out for doing the right thing.
     */
    public function updatePassword(UpdatePasswordRequest $request): JsonResponse
    {
        $user = $request->user();
        assert($user instanceof User);

        // Audited as its own action with an empty diff: that it changed is the
        // event, and the value never reaches the table (SECURITY.md §10).
        $user->auditAs('user.password_changed');

        $user->forceFill([
            'password' => (string) $request->string('password'),
            // A new password ends every "remember me" on every other device.
            'remember_token' => Str::random(60),
        ])->save();

        /*
         * The recaller cookie this browser holds names the OLD token, so the
         * device that just changed its password would be the one signed out.
         * Signing in again here reissues it, keeping remember-me where it was.
         */
        $guard = Auth::guard('web');

        if ($guard instanceof SessionGuard) {
            $guard->login($user, remember: $request->hasCookie($guard->getRecallerName()));
        }

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        return response()->json(null, 204);
    }

    /**
     * The signed-in user's own language and digits.
     *
     * Audited like any other change to a user row — the observer writes
     * `user.updated` with the before and after — and applied to THIS response
     * immediately, so the confirmation comes back in the language just chosen.
     */
    public function updatePreferences(UpdatePreferencesRequest $request, Localizer $localizer): UserResource
    {
        $user = $request->user();
        assert($user instanceof User);

        $user->fill($request->validated())->save();

        $localizer->use($user->locale, $user->numerals);

        return UserResource::make($user->refresh());
    }
}
