<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\ActivityController;
use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\ExpenseController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\InsightController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\SettingsController;
use App\Http\Controllers\Api\V1\UserController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API v1
|--------------------------------------------------------------------------
|
| Default deny: everything sits behind auth:sanctum except the two routes
| explicitly grouped as public below (SECURITY.md §2.1).
|
| State transitions are SUB-RESOURCE ACTIONS, not status patches. Confirming an
| order snapshots prices and moves stock; it is not a field assignment, and an
| API that presents it as one invites a client to try
| `PATCH /orders/1 {status: "confirmed"}` (ARCHITECTURE.md §4).
|
*/

Route::prefix('v1')->group(function (): void {

    // ---- Public ------------------------------------------------------------
    Route::get('health', HealthController::class)
        ->middleware('throttle:health')
        ->name('health');

    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:login')  // coarse backstop; LoginRequest owns
        ->name('auth.login');           // the real 5/min per email+IP limit

    // ---- Authenticated -----------------------------------------------------
    Route::middleware(['auth:sanctum', 'active', 'throttle:api'])->group(function (): void {

        Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
        Route::get('me', [AuthController::class, 'me'])->name('me');

        /* ---- Export ------------------------------------------------------ */
        /*
         * DECLARED BEFORE THE MODULE ROUTES ON PURPOSE. `orders/{order}` would
         * otherwise match `orders/export` first, try to resolve an order with
         * the id "export", and return a 404 that looks like a missing feature.
         *
         * Ten per hour per user, separately from the 120/minute API limit.
         * Bulk extraction is the exfiltration vector in this system, and a
         * limit generous enough never to be felt is not a limit
         * (SECURITY.md §7). Each of these also requires a distinct `*.export`
         * ability, checked by the controller against the policy.
         */
        // Named limiters, deliberately: see AppServiceProvider::defineRateLimits
        // for why an unnamed throttle nested in this group shared its counter.
        Route::middleware('throttle:exports')->group(function (): void {
            Route::get('orders/export', [OrderController::class, 'export']);
            Route::get('customers/export', [CustomerController::class, 'export']);
            Route::get('products/export', [ProductController::class, 'export']);
            Route::get('inventory/export', [InventoryController::class, 'export']);
            Route::get('expenses/export', [ExpenseController::class, 'export']);
            Route::get('activity/export', [ActivityController::class, 'export']);
        });

        /* ---- Orders ------------------------------------------------------ */
        Route::get('orders', [OrderController::class, 'index']);
        Route::post('orders', [OrderController::class, 'store']);
        Route::get('orders/{order}', [OrderController::class, 'show']);
        Route::patch('orders/{order}', [OrderController::class, 'update']);
        Route::delete('orders/{order}', [OrderController::class, 'destroy']);

        Route::post('orders/{order}/items', [OrderController::class, 'addItem']);
        Route::delete('orders/{order}/items/{item}', [OrderController::class, 'removeItem']);

        Route::post('orders/{order}/confirm', [OrderController::class, 'confirm']);
        Route::post('orders/{order}/fulfil', [OrderController::class, 'fulfil']);
        Route::post('orders/{order}/cancel', [OrderController::class, 'cancel']);
        Route::post('orders/{order}/refund', [OrderController::class, 'refund']);

        /* ---- Customers --------------------------------------------------- */
        Route::get('customers', [CustomerController::class, 'index']);
        Route::post('customers', [CustomerController::class, 'store']);
        Route::get('customers/{customer}', [CustomerController::class, 'show']);
        Route::patch('customers/{customer}', [CustomerController::class, 'update']);
        Route::delete('customers/{customer}', [CustomerController::class, 'destroy']);
        Route::get('customers/{customer}/orders', [CustomerController::class, 'orders']);

        /* ---- Products ---------------------------------------------------- */
        Route::get('products', [ProductController::class, 'index']);
        Route::post('products', [ProductController::class, 'store']);
        Route::get('products/{product}', [ProductController::class, 'show']);
        Route::patch('products/{product}', [ProductController::class, 'update']);
        Route::post('products/{product}/activate', [ProductController::class, 'activate']);
        Route::post('products/{product}/deactivate', [ProductController::class, 'deactivate']);

        /* ---- Inventory --------------------------------------------------- */
        Route::get('inventory', [InventoryController::class, 'index']);
        Route::get('inventory/low-stock', [InventoryController::class, 'lowStock']);
        Route::get('inventory/{product}/movements', [InventoryController::class, 'movements']);
        Route::post('inventory/{product}/adjust', [InventoryController::class, 'adjust']);
        Route::post('inventory/{product}/restock', [InventoryController::class, 'restock']);

        /* ---- Analytics --------------------------------------------------- */
        // Aggregation is the most expensive work in the system, so these carry
        // their own, tighter limit (SECURITY.md §7).
        Route::middleware('throttle:analytics')->group(function (): void {
            Route::get('dashboard', [AnalyticsController::class, 'dashboard']);
            Route::get('analytics/summary', [AnalyticsController::class, 'summary']);
            Route::get('analytics/timeseries', [AnalyticsController::class, 'timeseries']);
            Route::get('analytics/breakdown', [AnalyticsController::class, 'breakdown']);
        });

        /* ---- Expenses ---------------------------------------------------- */
        Route::get('expenses', [ExpenseController::class, 'index']);
        Route::post('expenses', [ExpenseController::class, 'store']);
        Route::get('expenses/{expense}', [ExpenseController::class, 'show']);
        Route::patch('expenses/{expense}', [ExpenseController::class, 'update']);
        Route::delete('expenses/{expense}', [ExpenseController::class, 'destroy']);

        /* ---- Insights ---------------------------------------------------- */
        // Evaluated over the analytics layer, so it carries the analytics
        // limit rather than the general one.
        Route::middleware('throttle:analytics')
            ->get('insights', [InsightController::class, 'index']);

        /* ---- Activity log ------------------------------------------------ */
        // Read-only by design: there is no store, update or destroy route,
        // because there is no code that writes here except AuditRecorder
        // (SECURITY.md §10).
        Route::get('activity', [ActivityController::class, 'index']);
        Route::get('activity/actions', [ActivityController::class, 'actions']);

        /* ---- Users ------------------------------------------------------- */
        Route::get('users', [UserController::class, 'index']);
        Route::post('users', [UserController::class, 'store']);
        Route::get('users/{user}', [UserController::class, 'show']);
        Route::patch('users/{user}', [UserController::class, 'update']);

        /*
         * Role changes and deactivation are sub-resource ACTIONS, not field
         * patches, for the same reason order transitions are: each runs the
         * last-Owner guard and each means something specific in the audit log.
         * `PATCH /users/1 {role: "owner"}` would hide a privilege escalation
         * inside a generic update (ARCHITECTURE.md §4).
         */
        Route::post('users/{user}/role', [UserController::class, 'changeRole']);
        Route::post('users/{user}/activate', [UserController::class, 'activate']);
        Route::post('users/{user}/deactivate', [UserController::class, 'deactivate']);

        /* ---- Business settings ------------------------------------------- */
        Route::get('settings', [SettingsController::class, 'show']);
        Route::patch('settings', [SettingsController::class, 'update']);
        Route::get('settings/expense-categories', [SettingsController::class, 'expenseCategories']);
    });
});
