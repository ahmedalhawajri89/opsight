<?php

declare(strict_types=1);

namespace App\Domain\Users;

use App\Authorization\Role;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Role changes and activation, and the only place the last-Owner rule lives.
 *
 * `role` and `is_active` are deliberately NOT fillable (SECURITY.md §6.3), so
 * there is no mass-assignment path to either one. This class is the only way
 * they move, which is what makes "the last active Owner cannot be demoted or
 * deactivated" a guarantee rather than a check somebody remembered to write in
 * one of the two controllers that can reach the column.
 *
 * WHY THE RULE EXISTS: Owner is the only role holding `users.change_role` and
 * `settings.update`. A system with no active Owner cannot promote anyone,
 * cannot change its own settings, and cannot be recovered through the
 * application at all — it needs someone with database access. That is not a
 * permissions error, it is an outage, and it is one click away from any Owner
 * tidying up their own account.
 */
final class UserAdministration
{
    public function changeRole(User $user, Role $role, ?int $actorId = null): User
    {
        return DB::transaction(function () use ($user, $role): User {
            $user = $this->lock($user);

            if ($role !== Role::Owner && $this->isLastActiveOwner($user)) {
                throw LastOwnerException::cannotDemote();
            }

            $previous = $user->role;

            // A privilege change deserves its own audit action and its own
            // before/after — `user.updated` would bury it among name edits.
            $user->auditAs('user.role_changed', [
                'from' => $previous->value,
                'to' => $role->value,
            ]);

            $user->forceFill(['role' => $role])->save();

            return $user->refresh();
        });
    }

    public function deactivate(User $user, ?int $actorId = null): User
    {
        return DB::transaction(function () use ($user): User {
            $user = $this->lock($user);

            if ($this->isLastActiveOwner($user)) {
                throw LastOwnerException::cannotDeactivate();
            }

            $user->auditAs('user.deactivated');

            /*
             * Takes effect on this user's NEXT REQUEST, not at their next
             * login: EnsureUserIsActive rejects a live session whose user was
             * deactivated mid-session (SECURITY.md §3). Revoking access that
             * only applies at next sign-in is not revoking access.
             */
            $user->forceFill(['is_active' => false])->save();

            return $user->refresh();
        });
    }

    public function activate(User $user, ?int $actorId = null): User
    {
        return DB::transaction(function () use ($user): User {
            $user = $this->lock($user);

            $user->auditAs('user.activated');

            $user->forceFill(['is_active' => true])->save();

            return $user->refresh();
        });
    }

    /**
     * Re-reads the user under a row lock.
     *
     * The count below is a check-then-act, and without the lock two Owners
     * demoting each other at the same moment both see "there are two Owners",
     * both pass, and the installation is left with none. Locking the row being
     * changed serialises the pair, so the second one re-counts after the first
     * has committed and is refused.
     */
    private function lock(User $user): User
    {
        return User::query()->lockForUpdate()->findOrFail($user->id);
    }

    private function isLastActiveOwner(User $user): bool
    {
        if ($user->role !== Role::Owner || ! $user->is_active) {
            return false;
        }

        $otherActiveOwners = User::query()
            ->where('role', Role::Owner)
            ->where('is_active', true)
            ->whereKeyNot($user->id)
            ->count();

        return $otherActiveOwners === 0;
    }
}
