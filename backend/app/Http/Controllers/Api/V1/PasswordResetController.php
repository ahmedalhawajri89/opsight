<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\ForgotPasswordRequest;
use App\Http\Requests\Auth\ResetPasswordRequest;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Auth\Events\PasswordReset;
use Illuminate\Auth\Passwords\PasswordBroker;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

/**
 * Forgotten passwords: a link by email, then a new password from that link.
 *
 * WHY THIS EXISTS NOW. A member of staff who forgot their password could only
 * ask their owner to set one, and an OWNER who forgot theirs had no way back
 * in at all. Laravel's password broker does the token work (hashed tokens, an
 * hour's life, one request a minute per address) and it looks users up
 * through the business-agnostic provider, as signing in does (ADR-023).
 *
 * THE ANSWER NEVER SAYS WHETHER AN ACCOUNT EXISTS. Asking for a link returns
 * the same 202 and the same sentence for a real address, an unknown one, a
 * deactivated account, a demo account and a request inside the broker's
 * one-minute throttle. Anything else would make this form the enumeration
 * endpoint the sign-in form is careful not to be (SECURITY.md §7).
 *
 * A deactivated account is sent nothing. Deactivation is how an owner takes
 * access away, and a reset link would hand it back.
 *
 * The demo's shared accounts are sent nothing either: a visitor resetting one
 * would lock out every visitor after them (config/demo.php).
 */
class PasswordResetController extends Controller
{
    public function forgot(ForgotPasswordRequest $request): JsonResponse
    {
        $email = (string) $request->string('email');

        if ($this->mayReset($email)) {
            $this->broker()->sendResetLink(['email' => $email]);
        }

        return response()->json(['message' => __('auth.reset_link_sent')], 202);
    }

    /**
     * Not signed in afterwards, on purpose. The link proves control of the
     * mailbox, not of this browser; signing in with the new password is one
     * more step, and it goes through the same throttled door as every other
     * sign-in. Every "remember me" on every device ends.
     */
    public function reset(ResetPasswordRequest $request): JsonResponse
    {
        $email = (string) $request->string('email');

        if (! $this->mayReset($email)) {
            throw $this->invalidLink();
        }

        $status = $this->broker()->reset(
            [
                'email' => $email,
                'token' => (string) $request->string('token'),
                'password' => (string) $request->string('password'),
            ],
            static function (User $user, string $password): void {
                // Nobody is signed in, so there is no business in context;
                // the audit row and the write both belong to the user's own.
                CurrentBusiness::get()->run($user->business_id, static function () use ($user, $password): void {
                    $user->auditAs('user.password_reset');

                    $user->forceFill([
                        'password' => $password,
                        'remember_token' => Str::random(60),
                    ])->save();
                });

                event(new PasswordReset($user));
            },
        );

        if ($status !== PasswordBroker::PASSWORD_RESET) {
            throw $this->invalidLink();
        }

        return response()->json(['message' => __('auth.reset_done')]);
    }

    /** An active account that is not one of the demo's shared ones. */
    private function mayReset(string $email): bool
    {
        if (config('demo.enabled') && in_array(strtolower($email), config('demo.accounts'), true)) {
            return false;
        }

        $user = $this->broker()->getUser(['email' => $email]);

        return $user instanceof User && $user->is_active;
    }

    /*
     * One message for an expired token, a used one, a forged one and an
     * address that does not match it. The reader's next step is the same in
     * every case (ask for a new link), and telling them apart would only help
     * someone guessing.
     */
    private function invalidLink(): ValidationException
    {
        return ValidationException::withMessages(['token' => __('auth.reset_invalid')]);
    }

    private function broker(): PasswordBroker
    {
        $broker = Password::broker();
        assert($broker instanceof PasswordBroker);

        return $broker;
    }
}
