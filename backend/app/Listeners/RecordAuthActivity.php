<?php

declare(strict_types=1);

namespace App\Listeners;

use App\Domain\Audit\AuditRecorder;
use App\Models\User;
use App\Support\Tenancy\BusinessScope;
use Illuminate\Auth\Events\Failed;
use Illuminate\Auth\Events\Lockout;
use Illuminate\Auth\Events\Login;
use Illuminate\Auth\Events\Logout;

/**
 * Audits authentication.
 *
 * Hooked to Laravel's auth events rather than written into AuthController,
 * because the requirement is "every sign-in is logged" and a line in the
 * controller only covers the sign-ins that go through that controller. An
 * event listener covers any future path — a console command, an impersonation
 * feature, a second guard — without that path having to remember.
 *
 * The attempted email is recorded on a failure and that is intentional: an
 * audit log that cannot say WHICH account was being attacked cannot answer the
 * only question anyone asks of it after an incident. The submitted password is
 * never recorded, in any form, hashed or otherwise (SECURITY.md §10).
 */
class RecordAuthActivity
{
    public function __construct(private readonly AuditRecorder $recorder) {}

    public function handleLogin(Login $event): void
    {
        $user = $event->user;

        $this->recorder->record(
            action: 'auth.login',
            subject: $user instanceof User ? $user : null,
            actorId: $user instanceof User ? $user->id : null,
        );
    }

    public function handleLogout(Logout $event): void
    {
        $user = $event->user;

        if (! $user instanceof User) {
            return;
        }

        $this->recorder->record(
            action: 'auth.logout',
            subject: $user,
            actorId: $user->id,
        );
    }

    /**
     * A failed attempt has no actor: whoever submitted it did not prove they
     * are the account holder, and attributing the row to that user would be a
     * false statement about who acted. `user_id` stays null and the attempted
     * address lives in the context instead.
     */
    public function handleFailed(Failed $event): void
    {
        $email = $this->email($event->credentials);

        $this->recorder->record(
            action: 'auth.login_failed',
            context: ['email' => $email],
            actorId: null,
            businessId: $this->businessOf($email),
        );
    }

    public function handleLockout(Lockout $event): void
    {
        $email = $this->email($event->request->only('email'));

        $this->recorder->record(
            action: 'auth.lockout',
            context: ['email' => $email],
            actorId: null,
            businessId: $this->businessOf($email),
        );
    }

    /**
     * An attack on an account belongs in that account's business's log, where
     * its owner can see it (ADR-023). An address that matches no account names
     * no business, and the row is kept with none.
     */
    private function businessOf(?string $email): ?int
    {
        if ($email === null) {
            return null;
        }

        $business = User::query()->withoutGlobalScope(BusinessScope::class)->where('email', $email)->value('business_id');

        return $business === null ? null : (int) $business;
    }

    /**
     * Pulls ONE named key rather than passing the credential array through.
     *
     * AuditRedactor would drop the password anyway, but relying on that here
     * would mean a new credential field — a one-time code, a device secret —
     * reaches the audit table by default and is only kept out if someone
     * remembers to extend the list. Naming the single safe key inverts that:
     * anything new is excluded until it is deliberately included.
     *
     * @param  array<array-key, mixed>  $credentials
     */
    private function email(array $credentials): ?string
    {
        $email = $credentials['email'] ?? null;

        return is_string($email) ? mb_substr($email, 0, 190) : null;
    }
}
