<?php

declare(strict_types=1);

namespace App\Authorization;

/**
 * The role → ability matrix. The single source of truth for authorization.
 *
 * Deliberately written as explicit lists rather than as inheritance
 * ("Manager inherits Staff, plus..."). Inheritance hides exactly the
 * exceptions that matter — Staff may confirm an order but may not cancel one,
 * and Manager may read costs while Staff may not. An explicit list is longer
 * and impossible to misread.
 *
 * Mirrors docs/product/ROLES_AND_PERMISSIONS.md, which a test asserts.
 */
final class AbilityRegistry
{
    /**
     * @return array<int, Ability>
     */
    public static function for(Role $role): array
    {
        return match ($role) {
            Role::Owner => self::owner(),
            Role::Manager => self::manager(),
            Role::Analyst => self::analyst(),
            Role::Staff => self::staff(),
        };
    }

    /**
     * The resolved ability strings sent to the frontend on /me.
     *
     * @return array<int, string>
     */
    public static function stringsFor(Role $role): array
    {
        return array_map(
            static fn (Ability $ability): string => $ability->value,
            self::for($role),
        );
    }

    public static function grants(Role $role, Ability $ability): bool
    {
        return in_array($ability, self::for($role), strict: true);
    }

    /**
     * The Owner holds every ability. This is the only role defined by
     * "everything", and it is why the last active Owner cannot be demoted.
     *
     * @return array<int, Ability>
     */
    private static function owner(): array
    {
        return Ability::cases();
    }

    /**
     * Full operational and financial authority. No authority over access
     * control, users or business settings, and no hard deletes.
     *
     * @return array<int, Ability>
     */
    private static function manager(): array
    {
        return [
            Ability::DashboardView,
            Ability::OrdersView,
            Ability::CustomersView,
            Ability::ProductsView,
            Ability::InventoryView,
            Ability::ExpensesView,
            Ability::AnalyticsView,
            Ability::ReportsView,
            Ability::ActivityView,

            Ability::OrdersCreate,
            Ability::CustomersCreate,
            Ability::ProductsCreate,
            Ability::CategoriesCreate,
            Ability::InventoryAdjust,
            Ability::ExpensesCreate,

            Ability::OrdersUpdate,
            Ability::OrdersConfirm,
            Ability::OrdersFulfil,
            Ability::OrdersCancel,
            Ability::OrdersRefund,
            Ability::OrdersRecordPayment,
            Ability::CustomersUpdate,
            Ability::ProductsUpdate,
            Ability::ExpensesUpdate,

            Ability::OrdersDelete,
            Ability::CustomersDelete,
            Ability::ProductsDeactivate,
            Ability::ExpensesDelete,

            Ability::OrdersExport,
            Ability::CustomersExport,
            Ability::ProductsExport,
            Ability::InventoryExport,
            Ability::ExpensesExport,
            Ability::AnalyticsExport,

            Ability::ProductsViewCost,
            Ability::MetricsViewCost,
            Ability::OrdersViewMargin,
            Ability::CustomersViewLtv,
        ];
    }

    /**
     * Reads and exports everything financial and operational. Writes nothing.
     * The correct shape for an accountant or external consultant.
     *
     * @return array<int, Ability>
     */
    private static function analyst(): array
    {
        return [
            Ability::DashboardView,
            Ability::OrdersView,
            Ability::CustomersView,
            Ability::ProductsView,
            Ability::InventoryView,
            Ability::ExpensesView,
            Ability::AnalyticsView,
            Ability::ReportsView,

            Ability::OrdersExport,
            Ability::CustomersExport,
            Ability::ProductsExport,
            Ability::InventoryExport,
            Ability::ExpensesExport,
            Ability::AnalyticsExport,

            Ability::ProductsViewCost,
            Ability::MetricsViewCost,
            Ability::OrdersViewMargin,
            Ability::CustomersViewLtv,
        ];
    }

    /**
     * Front-line data entry. Note what is absent: no cost, margin, profit or
     * expense ability of any kind, and no export.
     *
     * Staff cannot create products because product creation sets `cost`, a
     * field they may not read — a role must never be able to write a field it
     * cannot read, or the write form becomes an oracle for the hidden value.
     *
     * @return array<int, Ability>
     */
    private static function staff(): array
    {
        return [
            Ability::DashboardView,
            Ability::OrdersView,
            Ability::CustomersView,
            Ability::ProductsView,
            Ability::InventoryView,

            Ability::OrdersCreate,
            Ability::CustomersCreate,

            Ability::OrdersUpdate,   // own drafts only — narrowed by policy
            Ability::OrdersConfirm,
            Ability::OrdersFulfil,
            Ability::OrdersRecordPayment,  // money in only; refunds stay supervisory
            Ability::CustomersUpdate,

            Ability::OrdersDelete,   // own drafts only — narrowed by policy
        ];
    }
}
