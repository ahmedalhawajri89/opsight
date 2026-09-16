<?php

declare(strict_types=1);

namespace App\Policies;

use App\Authorization\Ability;
use App\Models\Expense;
use App\Models\User;

/**
 * Expenses are the primary financial boundary between Staff and Manager.
 *
 * Staff hold no expense ability at all, so every method here denies them —
 * the module is not merely hidden, it is unreachable.
 */
class ExpensePolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can(Ability::ExpensesView->value);
    }

    public function view(User $user, Expense $expense): bool
    {
        return $user->can(Ability::ExpensesView->value);
    }

    public function create(User $user): bool
    {
        return $user->can(Ability::ExpensesCreate->value);
    }

    public function update(User $user, Expense $expense): bool
    {
        return $user->can(Ability::ExpensesUpdate->value);
    }

    public function delete(User $user, Expense $expense): bool
    {
        return $user->can(Ability::ExpensesDelete->value);
    }

    public function export(User $user): bool
    {
        return $user->can(Ability::ExpensesExport->value);
    }
}
