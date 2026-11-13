<?php

declare(strict_types=1);

namespace App\Support\Auth;

use App\Models\User;
use App\Notifications\VerifyEmailNotification;
use Illuminate\Auth\SessionGuard;
use Illuminate\Support\Facades\Auth;
use LogicException;

/**
 * Proving that an account's email address belongs to whoever opened it.
 *
 * Sign-up never asked, and two things trusted the address anyway: Google
 * sign-in, which lets in whoever owns the address (so an account opened in
 * someone else's name became a trap for them), and the morning brief, which
 * mails whatever address the account carries (security audit, 2026-11-13).
 *
 * THE LINK IS SIGNED, NOT STORED. It carries the account's id and an expiry,
 * and a signature over both plus the address itself, keyed with the
 * application key. Nothing to keep or clean up, and changing the address
 * voids every link sent to the old one, because the old address is in what
 * was signed. It points at the frontend's /verify-email screen, which posts
 * the three values back; the API's own address never appears in an email, so
 * the link works the same behind the frontend's rewrite as without it.
 */
final class EmailVerification
{
    /** A link is good for three days: long enough for a busy inbox. */
    public const VALID_MINUTES = 60 * 24 * 3;

    public function send(User $user): void
    {
        if ($user->hasVerifiedEmail()) {
            return;
        }

        $user->notify((new VerifyEmailNotification($this->linkFor($user)))->locale($user->locale ?? 'en'));
    }

    public function linkFor(User $user): string
    {
        $expires = now()->addMinutes(self::VALID_MINUTES)->getTimestamp();

        return rtrim((string) config('app.frontend_url'), '/').'/verify-email?'.http_build_query([
            'id' => $user->id,
            'expires' => $expires,
            'signature' => $this->sign((int) $user->id, (string) $user->email, $expires),
        ]);
    }

    /**
     * The account the link was sent for, or null for a link that is forged,
     * expired, or was sent to an address the account no longer has.
     */
    public function resolve(int $id, int $expires, string $signature): ?User
    {
        if ($expires < now()->getTimestamp()) {
            return null;
        }

        $guard = Auth::guard('web');

        if (! $guard instanceof SessionGuard) {
            throw new LogicException('The web guard must be a SessionGuard.');
        }

        // Business-agnostic, as for sign-in: nobody is signed in to say which.
        $user = $guard->getProvider()->retrieveById($id);

        if (! $user instanceof User) {
            return null;
        }

        $expected = $this->sign((int) $user->id, (string) $user->email, $expires);

        return hash_equals($expected, $signature) ? $user : null;
    }

    private function sign(int $id, string $email, int $expires): string
    {
        return hash_hmac(
            'sha256',
            'verify-email|'.$id.'|'.mb_strtolower(trim($email)).'|'.$expires,
            (string) config('app.key'),
        );
    }
}
