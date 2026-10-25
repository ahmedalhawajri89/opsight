<?php

declare(strict_types=1);

namespace App\Policies;

use App\Authorization\Ability;
use App\Models\Customer;
use App\Models\User;

class CustomerPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can(Ability::CustomersView->value);
    }

    public function view(User $user, Customer $customer): bool
    {
        return $user->can(Ability::CustomersView->value);
    }

    public function create(User $user): bool
    {
        return $user->can(Ability::CustomersCreate->value);
    }

    public function update(User $user, Customer $customer): bool
    {
        return $user->can(Ability::CustomersUpdate->value);
    }

    /**
     * Soft delete only, and never for a customer with committed orders.
     *
     * Removing them must not rewrite history — their past orders still count
     * toward every metric (MVP_SCOPE.md §6.4).
     */
    public function delete(User $user, Customer $customer): bool
    {
        return $user->can(Ability::CustomersDelete->value)
            && ! $customer->hasOrderHistory();
    }

    /**
     * Erasure — the OPPOSITE case to delete() above, not a stronger one.
     *
     * delete() refuses a customer with committed orders because hiding them
     * would rewrite history. Erasure exists FOR that customer: the orders
     * stay, every figure is unmoved, and only the person behind them is
     * removed. So there is deliberately no hasOrderHistory() guard here
     * (ADR-026).
     *
     * Whether it has already been done is state, not authority, so it is not
     * decided here: the service answers a second attempt with a 409 that says
     * so, rather than a 403 that says the operator may not.
     */
    public function erase(User $user): bool
    {
        return $user->can(Ability::CustomersErase->value);
    }

    public function viewLifetimeValue(User $user): bool
    {
        return $user->can(Ability::CustomersViewLtv->value);
    }

    public function export(User $user): bool
    {
        return $user->can(Ability::CustomersExport->value);
    }
}
