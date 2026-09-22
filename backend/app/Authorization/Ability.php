<?php

declare(strict_types=1);

namespace App\Authorization;

/**
 * Every ability in the system, named `<module>.<ability>`.
 *
 * This enum is the vocabulary; AbilityRegistry is the role → ability mapping.
 * Both are the single source of truth, and the frontend receives the resolved
 * list from GET /api/v1/me rather than keeping its own copy.
 *
 * Abilities are declared here in full during Phase 01 even though the modules
 * they gate arrive in later phases. The matrix is a product decision that was
 * settled in Phase 00; declaring it once means a later phase wires a module up
 * rather than re-deciding who may use it.
 *
 * See docs/product/ROLES_AND_PERMISSIONS.md.
 */
enum Ability: string
{
    // ---- Module access -----------------------------------------------------
    case DashboardView = 'dashboard.view';
    case OrdersView = 'orders.view';
    case CustomersView = 'customers.view';
    case ProductsView = 'products.view';
    case InventoryView = 'inventory.view';
    case ExpensesView = 'expenses.view';
    case AnalyticsView = 'analytics.view';
    case ReportsView = 'reports.view';
    case UsersView = 'users.view';
    case ActivityView = 'activity.view';
    case SettingsView = 'settings.view';

    // ---- Create ------------------------------------------------------------
    case OrdersCreate = 'orders.create';
    case CustomersCreate = 'customers.create';
    case ProductsCreate = 'products.create';
    case CategoriesCreate = 'categories.create';
    case InventoryAdjust = 'inventory.adjust';
    case ExpensesCreate = 'expenses.create';
    case UsersCreate = 'users.create';

    // ---- Update and state transitions --------------------------------------
    case OrdersUpdate = 'orders.update';
    case OrdersConfirm = 'orders.confirm';
    case OrdersFulfil = 'orders.fulfil';
    case OrdersCancel = 'orders.cancel';
    case OrdersRefund = 'orders.refund';
    case OrdersRecordPayment = 'orders.record_payment';
    case CustomersUpdate = 'customers.update';
    case ProductsUpdate = 'products.update';
    case ExpensesUpdate = 'expenses.update';
    case UsersUpdate = 'users.update';
    case UsersChangeRole = 'users.change_role';
    case SettingsUpdate = 'settings.update';

    // ---- Delete ------------------------------------------------------------
    case OrdersDelete = 'orders.delete';
    case CustomersDelete = 'customers.delete';
    case ProductsDeactivate = 'products.deactivate';
    case ExpensesDelete = 'expenses.delete';
    case UsersDeactivate = 'users.deactivate';

    // ---- Export ------------------------------------------------------------
    case OrdersExport = 'orders.export';
    case CustomersExport = 'customers.export';
    case ProductsExport = 'products.export';
    case InventoryExport = 'inventory.export';
    case ExpensesExport = 'expenses.export';
    case AnalyticsExport = 'analytics.export';
    case ActivityExport = 'activity.export';

    // ---- Field-level --------------------------------------------------------
    // These gate individual fields inside responses every role can otherwise
    // read. A denied field is OMITTED from the payload, never sent as null.
    case ProductsViewCost = 'products.view_cost';
    case MetricsViewCost = 'metrics.view_cost';
    case OrdersViewMargin = 'orders.view_margin';
    case CustomersViewLtv = 'customers.view_ltv';

    /**
     * @return array<int, string>
     */
    public static function values(): array
    {
        return array_map(static fn (self $ability): string => $ability->value, self::cases());
    }
}
