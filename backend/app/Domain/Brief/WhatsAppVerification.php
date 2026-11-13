<?php

declare(strict_types=1);

namespace App\Domain\Brief;

use App\Domain\Brief\Channels\WhatsAppChannel;
use App\Models\User;
use Illuminate\Support\Facades\Cache;

/**
 * Proving that the WhatsApp number on an account is its owner's (security
 * audit, 2026-11-13).
 *
 * The brief used to go to whatever number was typed. Anyone could sign up,
 * enter a stranger's number, name a product after a link, and have this
 * installation's WhatsApp Business number message that stranger every
 * morning — at the operator's expense and to the number's reputation.
 *
 * A six-digit code goes to the number; typing it back proves it. The code is
 * kept for ten minutes, hashed with the number it was sent to (a number
 * changed in between voids it), and five wrong guesses throw it away. The
 * proof is stored on the account and cleared whenever the number changes
 * (User::booted).
 */
final class WhatsAppVerification
{
    public const VALID_MINUTES = 10;

    public const MAX_ATTEMPTS = 5;

    public function __construct(private readonly WhatsAppChannel $whatsapp) {}

    public function sendCode(User $user): void
    {
        $phone = (string) $user->whatsapp_phone;

        if ($phone === '') {
            throw new BriefProblem(__('brief.no_phone'));
        }

        $code = str_pad((string) random_int(0, 999_999), 6, '0', STR_PAD_LEFT);

        $this->whatsapp->sendCode($phone, $code, $user->locale ?? 'en');

        Cache::put($this->key($user), [
            'hash' => $this->hash($phone, $code),
            'attempts' => 0,
        ], now()->addMinutes(self::VALID_MINUTES));
    }

    /** True when the code proves the number; the account is then marked. */
    public function verify(User $user, string $code): bool
    {
        $pending = Cache::get($this->key($user));

        if (! is_array($pending)) {
            return false;
        }

        if (hash_equals((string) $pending['hash'], $this->hash((string) $user->whatsapp_phone, trim($code)))) {
            Cache::forget($this->key($user));

            $user->auditAs('user.whatsapp_verified');
            $user->forceFill(['whatsapp_verified_at' => now()])->save();

            return true;
        }

        $attempts = (int) $pending['attempts'] + 1;

        if ($attempts >= self::MAX_ATTEMPTS) {
            Cache::forget($this->key($user));
        } else {
            Cache::put($this->key($user), ['hash' => $pending['hash'], 'attempts' => $attempts], now()->addMinutes(self::VALID_MINUTES));
        }

        return false;
    }

    private function key(User $user): string
    {
        return 'whatsapp-code:'.$user->id;
    }

    private function hash(string $phone, string $code): string
    {
        return hash_hmac('sha256', $phone.'|'.$code, (string) config('app.key'));
    }
}
