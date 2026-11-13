<?php

declare(strict_types=1);

use App\Http\Controllers\Api\V1\ActivityController;
use App\Http\Controllers\Api\V1\AnalyticsController;
use App\Http\Controllers\Api\V1\AssistantController;
use App\Http\Controllers\Api\V1\AuthController;
use App\Http\Controllers\Api\V1\BriefController;
use App\Http\Controllers\Api\V1\CustomerController;
use App\Http\Controllers\Api\V1\EmailVerificationController;
use App\Http\Controllers\Api\V1\ExpenseController;
use App\Http\Controllers\Api\V1\FileImportController;
use App\Http\Controllers\Api\V1\ForecastController;
use App\Http\Controllers\Api\V1\GoogleSignInController;
use App\Http\Controllers\Api\V1\HealthController;
use App\Http\Controllers\Api\V1\InsightController;
use App\Http\Controllers\Api\V1\IntegrationController;
use App\Http\Controllers\Api\V1\InventoryController;
use App\Http\Controllers\Api\V1\OnboardingController;
use App\Http\Controllers\Api\V1\OrderController;
use App\Http\Controllers\Api\V1\PasswordResetController;
use App\Http\Controllers\Api\V1\ProductController;
use App\Http\Controllers\Api\V1\ReportController;
use App\Http\Controllers\Api\V1\RoleController;
use App\Http\Controllers\Api\V1\SettingsController;
use App\Http\Controllers\Api\V1\UserController;
use App\Http\Controllers\Api\V1\WebhookController;
use App\Http\Controllers\Api\V1\ZidConnectionController;
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

    // A new business and its owner (ADR-024). Each call creates a business.
    Route::post('auth/register', [AuthController::class, 'register'])
        ->middleware('throttle:register')
        ->name('auth.register');

    // Google, for an account that already exists; 404 until it is configured.
    Route::post('auth/google', GoogleSignInController::class)
        ->middleware('throttle:login')
        ->name('auth.google');

    // A forgotten password: a link by email, then a new one from that link.
    // Both answer the same way whether or not the address has an account.
    Route::post('auth/forgot-password', [PasswordResetController::class, 'forgot'])
        ->middleware('throttle:password-reset')
        ->name('auth.password.forgot');

    Route::post('auth/reset-password', [PasswordResetController::class, 'reset'])
        ->middleware('throttle:password-reset')
        ->name('auth.password.reset');

    // The link in the confirmation email. Public: it is opened from an inbox,
    // and the signature in it is the proof (EmailVerification).
    Route::post('auth/email/verify', [EmailVerificationController::class, 'verify'])
        ->middleware('throttle:verify-email')
        ->name('auth.email.verify');

    /*
     * Webhook deliveries (ADR-027). Unauthenticated by necessity — a provider
     * has no session — and the signature is the authentication.
     *
     * An unregistered provider name is a 404, so this is not an open endpoint
     * waiting for a handler: today there are no providers and every name is a
     * 404. Phase 6 registers Salla.
     */
    Route::post('webhooks/{provider}', WebhookController::class)
        ->middleware('throttle:webhooks')
        ->where('provider', '[a-z][a-z0-9_-]{1,31}')
        ->name('webhooks.receive');

    // ---- Authenticated -----------------------------------------------------
    // `demo` keeps the public demo's own accounts unchangeable (config/demo.php);
    // it does nothing on any other installation.
    Route::middleware(['auth:sanctum', 'active', 'demo', 'throttle:api'])->group(function (): void {

        Route::post('auth/logout', [AuthController::class, 'logout'])->name('auth.logout');
        Route::get('me', [AuthController::class, 'me'])->name('me');
        Route::patch('me/preferences', [AuthController::class, 'updatePreferences'])->name('me.preferences');
        Route::post('me/email/verification', [EmailVerificationController::class, 'resend'])
            ->middleware('throttle:verify-email-send')
            ->name('me.email.resend');

        // Its own limiter: it accepts a current password, so it must not become
        // a way to guess one (SECURITY.md §7).
        Route::patch('me/password', [AuthController::class, 'updatePassword'])
            ->middleware('throttle:password')
            ->name('me.password');
        Route::post('onboarding/complete', [OnboardingController::class, 'complete'])->name('onboarding.complete');

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
        Route::post('orders/{order}/payments', [OrderController::class, 'recordPayment']);

        /* ---- Customers --------------------------------------------------- */
        Route::get('customers', [CustomerController::class, 'index']);
        Route::post('customers', [CustomerController::class, 'store']);
        Route::get('customers/{customer}', [CustomerController::class, 'show']);
        Route::patch('customers/{customer}', [CustomerController::class, 'update']);
        Route::delete('customers/{customer}', [CustomerController::class, 'destroy']);
        Route::get('customers/{customer}/orders', [CustomerController::class, 'orders']);

        /*
         * A data-subject export, and an erasure (ADR-026). Sub-resource
         * actions for the same reason the order transitions are: erasing a
         * person is not `PATCH /customers/1 {name: null}`, it is a named,
         * audited event with legal meaning.
         *
         * The export spends the same budget as every other bulk extraction —
         * it is one person's whole dossier. No ordering hazard with
         * `customers/export` above: that is two segments and these are three.
         */
        Route::get('customers/{customer}/export', [CustomerController::class, 'exportData'])
            ->middleware('throttle:exports');
        Route::post('customers/{customer}/erase', [CustomerController::class, 'erase']);

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
            Route::get('analytics/vat', [AnalyticsController::class, 'vat']);
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
        Route::get('activity/summary', [ActivityController::class, 'summary']);

        /* ---- Users ------------------------------------------------------- */
        Route::get('roles', [RoleController::class, 'index']);
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

        /* ---- Integrations ------------------------------------------------ */
        /*
         * Claiming has a limiter of its own because it accepts an identifier
         * a merchant reads off a screen, not a secret. The limit is what
         * keeps "say which store is yours" from becoming "try store ids
         * until one of them is waiting" (SECURITY.md §7).
         */
        Route::get('integrations', [IntegrationController::class, 'index']);
        Route::post('integrations/claim', [IntegrationController::class, 'claim'])
            ->middleware('throttle:integration-claim');
        Route::delete('integrations/{integration}', [IntegrationController::class, 'destroy']);

        // Zid connects through an OAuth redirect bound to this session, so
        // there is nothing to guess and no claim to rate-limit as tightly;
        // the claim limiter still caps a script hammering the token endpoint.
        Route::get('integrations/zid/authorize', [ZidConnectionController::class, 'authorizeUrl'])
            ->middleware('throttle:integration-claim');
        Route::post('integrations/zid/callback', [ZidConnectionController::class, 'callback'])
            ->middleware('throttle:integration-claim');

        // Importing from a file (ADR-039). Limited like exports: each request
        // reads a whole spreadsheet, and the second may write thousands of rows.
        Route::post('imports/preview', [FileImportController::class, 'preview'])
            ->middleware('throttle:imports');
        Route::post('imports', [FileImportController::class, 'store'])
            ->middleware('throttle:imports');

        /* ---- Forecasts (phase D) ----------------------------------------- */
        // Aggregation over months of history, like analytics: its limit too.
        Route::get('forecasts/stock', [ForecastController::class, 'stock'])
            ->middleware('throttle:analytics');
        Route::get('forecasts/cash', [ForecastController::class, 'cash'])
            ->middleware('throttle:analytics');
        Route::put('forecasts/cash/balance', [ForecastController::class, 'setBalance']);
        Route::get('reports/financing', [ReportController::class, 'financing'])
            ->middleware('throttle:analytics');

        /* ---- The morning brief (phase C) ---------------------------------- */
        Route::get('me/brief', [BriefController::class, 'show']);
        // A test send reaches a real inbox or phone; a few an hour is plenty.
        Route::post('me/brief/test', [BriefController::class, 'test'])->middleware('throttle:brief-test');
        // Proving the WhatsApp number before anything is sent to it.
        Route::post('me/whatsapp/code', [BriefController::class, 'sendWhatsAppCode'])->middleware('throttle:whatsapp-code');
        Route::post('me/whatsapp/verify', [BriefController::class, 'verifyWhatsApp'])->middleware('throttle:whatsapp-verify');

        /* ---- Ask Baydar (ADR-038) ---------------------------------------- */
        Route::get('assistant/conversations', [AssistantController::class, 'index']);
        Route::get('assistant/conversations/{conversation}', [AssistantController::class, 'show'])
            ->whereNumber('conversation');
        Route::delete('assistant/conversations/{conversation}', [AssistantController::class, 'destroy'])
            ->whereNumber('conversation');
        // Each question is several model calls; the monthly ceiling caps the
        // spend, this caps a script.
        Route::post('assistant/messages', [AssistantController::class, 'store'])
            ->middleware('throttle:assistant');

        /* ---- Business settings ------------------------------------------- */
        Route::get('settings', [SettingsController::class, 'show']);
        Route::patch('settings', [SettingsController::class, 'update']);
        Route::get('settings/expense-categories', [SettingsController::class, 'expenseCategories']);
    });
});
