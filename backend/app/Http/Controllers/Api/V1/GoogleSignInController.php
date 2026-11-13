<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Models\User;
use App\Support\Auth\GoogleIdTokens;
use App\Support\Localization\Localizer;
use Illuminate\Auth\SessionGuard;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use LogicException;

/**
 * Signing in with a Google account.
 *
 * IT SIGNS IN AN ACCOUNT THAT ALREADY EXISTS; IT NEVER CREATES ONE. Staff
 * accounts are created by an owner, who chooses their role, and a business is
 * signed up with a name and a market (ADR-024). A Google token carries
 * neither. So Google is a second way through the door for a person this
 * installation already knows, matched by the address Google has verified.
 *
 * Saying "no account uses this address" is safe here in a way it is not on
 * the password form: the caller has just proved to Google that they own the
 * address, so the answer tells them nothing about anyone else.
 *
 * A 404 until GOOGLE_CLIENT_ID is set, so an installation that has not
 * configured Google has no endpoint for it, and the frontend shows no button.
 */
class GoogleSignInController extends Controller
{
    public function __invoke(Request $request, GoogleIdTokens $tokens, Localizer $localizer): JsonResponse
    {
        abort_unless($tokens->enabled(), 404);

        $request->validate(['credential' => ['required', 'string', 'max:4096']]);

        $email = $tokens->verifiedEmail((string) $request->string('credential'));

        if ($email === null) {
            throw ValidationException::withMessages(['credential' => __('auth.google_failed')]);
        }

        $guard = Auth::guard('web');

        // As for a password (LoginRequest): anything but the session guard
        // is a configuration change, and sign-in stops rather than guessing.
        if (! $guard instanceof SessionGuard) {
            throw new LogicException('The web guard must be a SessionGuard.');
        }

        // The business-agnostic provider, as for a password: sign-in finds the
        // user first and takes the business from them (ADR-023).
        $user = $guard->getProvider()->retrieveByCredentials(['email' => $email, 'is_active' => true]);

        if (! $user instanceof User) {
            throw ValidationException::withMessages(['credential' => __('auth.google_no_account')]);
        }

        /*
         * NOT INTO AN ACCOUNT WHOSE ADDRESS WAS NEVER PROVED (security audit,
         * 2026-11-13). Sign-up does not need the address to be the
         * signer's, so anyone could open an account in someone else's name
         * with a password of their own, and wait. When the real owner of the
         * address later came in through Google, they landed in that account
         * — and everything they typed into it was readable by whoever held
         * the password. Google proves the caller owns the address; it does
         * not prove the account's creator did.
         *
         * Such an account is opened by proving the address first: the link
         * in the confirmation email, or a password reset, either of which
         * reaches only the real inbox (and a reset ends every session the
         * creator had). Saying so is no disclosure: the caller has just
         * proved to Google that the address is theirs.
         */
        if (! $user->hasVerifiedEmail()) {
            throw ValidationException::withMessages(['credential' => __('auth.google_unverified')]);
        }

        $guard->login($user);

        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        $user->forceFill(['last_login_at' => now()])->save();
        $localizer->use($user->locale ?? 'en', $user->numerals ?? 'latn');

        return UserResource::make($user)->response()->setStatusCode(200);
    }
}
