<?php

declare(strict_types=1);

use App\Authorization\Ability;
use App\Authorization\AbilityRegistry;
use App\Authorization\Role;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| The authorization matrix
|--------------------------------------------------------------------------
|
| These assertions are transcribed from docs/product/ROLES_AND_PERMISSIONS.md
| by hand, deliberately. If the registry is ever changed without the document
| being changed too, this file fails — which is the point. A permission matrix
| that drifts from its specification is how a role quietly gains access.
|
*/

it('grants the owner every ability', function (): void {
    expect(AbilityRegistry::for(Role::Owner))
        ->toHaveCount(count(Ability::cases()));
});

it('never lets a non-owner role manage users or settings', function (Role $role): void {
    $abilities = AbilityRegistry::for($role);

    expect($abilities)
        ->not->toContain(Ability::UsersView)
        ->not->toContain(Ability::UsersCreate)
        ->not->toContain(Ability::UsersUpdate)
        ->not->toContain(Ability::UsersChangeRole)
        ->not->toContain(Ability::UsersDeactivate)
        ->not->toContain(Ability::SettingsView)
        ->not->toContain(Ability::SettingsUpdate);
})->with([
    'manager' => Role::Manager,
    'analyst' => Role::Analyst,
    'staff' => Role::Staff,
]);

/*
|--------------------------------------------------------------------------
| Staff — the project's hardest authorization boundary
|--------------------------------------------------------------------------
*/

it('never grants staff any cost, margin or profit visibility', function (): void {
    $abilities = AbilityRegistry::for(Role::Staff);

    expect($abilities)
        ->not->toContain(Ability::ProductsViewCost)
        ->not->toContain(Ability::MetricsViewCost)
        ->not->toContain(Ability::OrdersViewMargin)
        ->not->toContain(Ability::CustomersViewLtv)
        ->not->toContain(Ability::ExpensesView)
        ->not->toContain(Ability::AnalyticsView);
});

it('never grants staff any export ability', function (): void {
    $exportAbilities = array_filter(
        Ability::cases(),
        static fn (Ability $a): bool => str_ends_with($a->value, '.export'),
    );

    expect($exportAbilities)->not->toBeEmpty();

    foreach ($exportAbilities as $ability) {
        expect(AbilityRegistry::grants(Role::Staff, $ability))
            ->toBeFalse("Staff must not hold {$ability->value}");
    }
});

it('does not let staff create products, because creation sets a field they cannot read', function (): void {
    // A role that cannot read a field must not be able to write it, or the
    // create form becomes an oracle for the hidden value.
    expect(AbilityRegistry::grants(Role::Staff, Ability::ProductsViewCost))->toBeFalse();
    expect(AbilityRegistry::grants(Role::Staff, Ability::ProductsCreate))->toBeFalse();
    expect(AbilityRegistry::grants(Role::Staff, Ability::ProductsUpdate))->toBeFalse();
});

it('lets staff confirm an order but not cancel or refund one', function (): void {
    expect(AbilityRegistry::grants(Role::Staff, Ability::OrdersConfirm))->toBeTrue();
    expect(AbilityRegistry::grants(Role::Staff, Ability::OrdersFulfil))->toBeTrue();
    expect(AbilityRegistry::grants(Role::Staff, Ability::OrdersCancel))->toBeFalse();
    expect(AbilityRegistry::grants(Role::Staff, Ability::OrdersRefund))->toBeFalse();
});

it('lets staff take a payment but keeps refunds supervisory', function (): void {
    expect(AbilityRegistry::grants(Role::Staff, Ability::OrdersRecordPayment))->toBeTrue();
    expect(AbilityRegistry::grants(Role::Analyst, Ability::OrdersRecordPayment))->toBeFalse();
});

/*
|--------------------------------------------------------------------------
| Analyst — reads everything, writes nothing
|--------------------------------------------------------------------------
*/

it('grants the analyst no write ability of any kind', function (): void {
    $writeSuffixes = ['.create', '.update', '.delete', '.confirm', '.fulfil',
        '.cancel', '.refund', '.adjust', '.deactivate', '.change_role'];

    foreach (AbilityRegistry::for(Role::Analyst) as $ability) {
        foreach ($writeSuffixes as $suffix) {
            expect(str_ends_with($ability->value, $suffix))
                ->toBeFalse("Analyst must not hold the write ability {$ability->value}");
        }
    }
});

it('grants the analyst full cost visibility and export', function (): void {
    expect(AbilityRegistry::grants(Role::Analyst, Ability::MetricsViewCost))->toBeTrue();
    expect(AbilityRegistry::grants(Role::Analyst, Ability::ProductsViewCost))->toBeTrue();
    expect(AbilityRegistry::grants(Role::Analyst, Ability::AnalyticsExport))->toBeTrue();
});

/*
|--------------------------------------------------------------------------
| Manager
|--------------------------------------------------------------------------
*/

it('grants the manager full operational and financial authority', function (): void {
    foreach ([
        Ability::OrdersCancel,
        Ability::OrdersRefund,
        Ability::ExpensesView,
        Ability::ExpensesCreate,
        Ability::InventoryAdjust,
        Ability::MetricsViewCost,
        Ability::ActivityView,
    ] as $ability) {
        expect(AbilityRegistry::grants(Role::Manager, $ability))
            ->toBeTrue("Manager should hold {$ability->value}");
    }
});

/*
|--------------------------------------------------------------------------
| Registry integrity
|--------------------------------------------------------------------------
*/

it('returns no duplicate abilities for any role', function (Role $role): void {
    $abilities = AbilityRegistry::stringsFor($role);

    expect($abilities)->toEqualCanonicalizing(array_unique($abilities));
})->with(Role::cases());

it('fails closed on an unknown ability', function (): void {
    $user = new User;
    $user->role = Role::Owner;

    expect($user->hasAbility('orders.teleport'))->toBeFalse();
});
