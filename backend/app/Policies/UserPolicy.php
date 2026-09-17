<?php

declare(strict_types=1);

namespace App\Policies;

use App\Authorization\Ability;
use App\Models\User;

/**
 * Access control over access control. Owner-only in the MVP.
 *
 * Note what is NOT here: any ownership exception. Elsewhere in the system a
 * policy narrows an ability by ownership — Staff may edit *their own* drafts.
 * There is no equivalent for users, because "may edit their own account" is
 * how a Manager becomes an Owner.
 */
class UserPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can(Ability::UsersView->value);
    }

    public function view(User $user, User $subject): bool
    {
        return $user->can(Ability::UsersView->value);
    }

    public function create(User $user): bool
    {
        return $user->can(Ability::UsersCreate->value);
    }

    public function update(User $user, User $subject): bool
    {
        return $user->can(Ability::UsersUpdate->value);
    }

    /**
     * A distinct ability from `update`.
     *
     * Editing someone's display name and granting them the run of the system
     * are not the same action, and an API that routes both through one
     * permission has one permission that means "everything".
     */
    public function changeRole(User $user, User $subject): bool
    {
        return $user->can(Ability::UsersChangeRole->value);
    }

    public function deactivate(User $user, User $subject): bool
    {
        return $user->can(Ability::UsersDeactivate->value);
    }
}
