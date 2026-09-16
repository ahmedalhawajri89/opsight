<?php

declare(strict_types=1);

namespace App\Policies;

use App\Authorization\Ability;
use App\Models\InventoryItem;
use App\Models\User;

/**
 * Inventory.
 *
 * Staff can SEE stock — the job requires it — but cannot adjust it. A manual
 * adjustment has no paper trail outside this system, so it is supervisory.
 */
class InventoryPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can(Ability::InventoryView->value);
    }

    public function view(User $user, InventoryItem $item): bool
    {
        return $user->can(Ability::InventoryView->value);
    }

    public function adjust(User $user): bool
    {
        return $user->can(Ability::InventoryAdjust->value);
    }

    public function restock(User $user): bool
    {
        return $user->can(Ability::InventoryAdjust->value);
    }

    public function export(User $user): bool
    {
        return $user->can(Ability::InventoryExport->value);
    }
}
