<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\ExpenseController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\ProductController;
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
        ->middleware('throttle:30,1')
        ->name('health');

    Route::post('auth/login', [AuthController::class, 'login'])
        ->middleware('throttle:10,1')   // coarse backstop; LoginRequest owns
        ->name('auth.login');           // the real 5/min per email+IP limit

    // ---- Authenticated -----------------------------------------------------
    Route::middleware(['auth:sanctum', 'active', 'throttle:120,1'])->group(function (): void {

        Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
        Route::get('me', [AuthController::class, 'me'])->name('me');

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
        Route::middleware('throttle:60,1')->group(function (): void {
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
    });
});
