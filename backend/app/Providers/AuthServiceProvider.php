<?php

declare(strict_types=1);

namespace App\Providers;

use App\Authorization\Ability;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Policies\CustomerPolicy;
use App\Policies\ExpensePolicy;
use App\Policies\InventoryPolicy;
use App\Policies\OrderPolicy;
use App\Policies\ProductPolicy;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\ServiceProvider;

class AuthServiceProvider extends ServiceProvider
{
    /**
     * Policies are registered explicitly rather than by naming convention.
     *
     * A convention silently does nothing when a class is renamed or misplaced,
     * and "silently does nothing" in an authorization layer means open access.
     *
     * @var array<class-string, class-string>
     */
    private array $policies = [
        Order::class => OrderPolicy::class,
        Product::class => ProductPolicy::class,
        Customer::class => CustomerPolicy::class,
        Expense::class => ExpensePolicy::class,
        InventoryItem::class => InventoryPolicy::class,
    ];

    public function boot(): void
    {
        foreach ($this->policies as $model => $policy) {
            Gate::policy($model, $policy);
        }

        /*
         * Register every ability as a Gate, so `$user->can('expenses.view')`,
         * `Gate::allows(...)`, the `can:` route middleware and `@can` all
         * resolve through the one registry.
         *
         * Note there is NO Gate::before() granting the Owner everything. The
         * Owner's blanket access comes from AbilityRegistry returning the full
         * ability list, which keeps the matrix in one readable place instead of
         * splitting it between a table and a short-circuit.
         */
        foreach (Ability::cases() as $ability) {
            Gate::define(
                $ability->value,
                static fn (User $user): bool => $user->hasAbility($ability),
            );
        }
    }
}
