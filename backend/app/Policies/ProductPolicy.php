<?php

declare(strict_types=1);

namespace App\Policies;

use App\Authorization\Ability;
use App\Models\Product;
use App\Models\User;

class ProductPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can(Ability::ProductsView->value);
    }

    public function view(User $user, Product $product): bool
    {
        return $user->can(Ability::ProductsView->value);
    }

    /**
     * Staff hold neither create nor update.
     *
     * Creating a product sets `cost`, a field they may not read — and a role
     * that cannot read a field must not be able to write it, or the form
     * becomes an oracle for the hidden value (ROLES_AND_PERMISSIONS.md §3.2).
     */
    public function create(User $user): bool
    {
        return $user->can(Ability::ProductsCreate->value);
    }

    public function update(User $user, Product $product): bool
    {
        return $user->can(Ability::ProductsUpdate->value);
    }

    public function deactivate(User $user, Product $product): bool
    {
        return $user->can(Ability::ProductsDeactivate->value);
    }

    /**
     * A product with sales history is never hard-deleted — its order lines
     * reference it, and removing it would break the navigation from a
     * historical order back to its catalog entry.
     */
    public function delete(User $user, Product $product): bool
    {
        return $user->can(Ability::ProductsDeactivate->value)
            && ! $product->hasSalesHistory();
    }

    public function viewCost(User $user): bool
    {
        return $user->can(Ability::ProductsViewCost->value);
    }

    public function export(User $user): bool
    {
        return $user->can(Ability::ProductsExport->value);
    }
}
