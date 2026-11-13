<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Support\Auth\EmailVerification;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Confirming an account's email address (security audit, 2026-11-13).
 *
 * `verify` is public: the link is opened from an inbox, quite possibly on a
 * device where nobody is signed in, and the signature is the proof
 * (EmailVerification). `resend` is for the signed-in owner of the account.
 */
class EmailVerificationController extends Controller
{
    public function verify(Request $request, EmailVerification $verification): JsonResponse
    {
        $data = $request->validate([
            'id' => ['required', 'integer', 'min:1'],
            'expires' => ['required', 'integer', 'min:1'],
            'signature' => ['required', 'string', 'size:64'],
        ]);

        $user = $verification->resolve((int) $data['id'], (int) $data['expires'], (string) $data['signature']);

        // One answer for forged, expired and out-of-date links alike.
        if (! $user instanceof User) {
            throw ValidationException::withMessages(['signature' => __('auth.verify_invalid')]);
        }

        if (! $user->hasVerifiedEmail()) {
            // Nobody may be signed in; the write belongs to the user's business.
            CurrentBusiness::get()->run($user->business_id, static function () use ($user): void {
                $user->auditAs('user.email_verified');
                $user->forceFill(['email_verified_at' => now()])->save();
            });
        }

        return response()->json(['message' => __('auth.verify_done')]);
    }

    public function resend(Request $request, EmailVerification $verification): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $verification->send($user);

        return response()->json(['message' => __('auth.verify_sent')], 202);
    }
}
