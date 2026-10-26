<?php

declare(strict_types=1);

namespace App\Policies;

use App\Authorization\Ability;
use App\Models\Integration;
use App\Models\User;

/**
 * Who may connect a store, and who may cut it off.
 *
 * Owner only, every method, and deliberately not split into a read half and
 * a write half. A connection's screen shows which store a business's figures
 * are being computed from, and that is an owner's question; there is nothing
 * here a manager needs to see but may not change.
 */
class IntegrationPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can(Ability::IntegrationsManage->value);
    }

    public function view(User $user, Integration $integration): bool
    {
        return $user->can(Ability::IntegrationsManage->value);
    }

    public function create(User $user): bool
    {
        return $user->can(Ability::IntegrationsManage->value);
    }

    /**
     * Disconnecting.
     *
     * This is the undo for a store claimed in error, so it may never be
     * harder to reach than claiming was.
     */
    public function delete(User $user, Integration $integration): bool
    {
        return $user->can(Ability::IntegrationsManage->value);
    }
}
