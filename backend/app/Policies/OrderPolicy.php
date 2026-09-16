<?php

declare(strict_types=1);

namespace App\Policies;

use App\Authorization\Ability;
use App\Models\Order;
use App\Models\User;

/**
 * Order authorization.
 *
 * TWO CHECKS, ALWAYS SEPARATE (SECURITY.md §5.3):
 *
 *   1. does this user hold the ability at all?
 *   2. is THIS order one they may act on?
 *
 * `orders.update` says Staff may edit drafts. A second check says *which*
 * drafts — their own. Collapsing the two is how a role quietly gains access to
 * everyone else's records.
 */
class OrderPolicy
{
    public function viewAny(User $user): bool
    {
        return $user->can(Ability::OrdersView->value);
    }

    public function view(User $user, Order $order): bool
    {
        // Staff currently read all orders, not only their own (an open question
        // in ROLES_AND_PERMISSIONS.md §7). Narrowing it is a one-line change
        // here rather than a hunt through controllers.
        return $user->can(Ability::OrdersView->value);
    }

    public function create(User $user): bool
    {
        return $user->can(Ability::OrdersCreate->value);
    }

    /**
     * Editing is draft-only for everyone, and own-drafts-only for Staff.
     *
     * The immutability rule outranks the ability: once an order is confirmed,
     * nobody edits it — an Owner included. Corrections go through cancel and
     * re-enter, which leaves both facts on record (MVP_SCOPE.md §5).
     */
    public function update(User $user, Order $order): bool
    {
        if (! $order->isEditable()) {
            return false;
        }

        if (! $user->can(Ability::OrdersUpdate->value)) {
            return false;
        }

        return $this->ownsOrCanActOnOthers($user, $order);
    }

    public function delete(User $user, Order $order): bool
    {
        if (! $order->isEditable()) {
            return false;
        }

        if (! $user->can(Ability::OrdersDelete->value)) {
            return false;
        }

        return $this->ownsOrCanActOnOthers($user, $order);
    }

    public function confirm(User $user, Order $order): bool
    {
        return $user->can(Ability::OrdersConfirm->value)
            && $this->ownsOrCanActOnOthers($user, $order);
    }

    public function fulfil(User $user, Order $order): bool
    {
        return $user->can(Ability::OrdersFulfil->value);
    }

    /**
     * Cancel and refund are supervisory: both reverse recognised revenue and
     * move stock, which is why Staff hold neither.
     */
    public function cancel(User $user, Order $order): bool
    {
        return $user->can(Ability::OrdersCancel->value);
    }

    public function refund(User $user, Order $order): bool
    {
        return $user->can(Ability::OrdersRefund->value);
    }

    public function export(User $user): bool
    {
        return $user->can(Ability::OrdersExport->value);
    }

    /**
     * A user who can cancel orders is supervisory, so they may also act on a
     * colleague's draft. Everyone else acts on their own.
     */
    private function ownsOrCanActOnOthers(User $user, Order $order): bool
    {
        if ($user->can(Ability::OrdersCancel->value)) {
            return true;
        }

        return $order->created_by === $user->id;
    }
}
