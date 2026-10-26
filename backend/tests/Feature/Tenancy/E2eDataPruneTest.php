<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| Removing what a browser test created (opsight:e2e:prune)
|--------------------------------------------------------------------------
|
| Two specs sign a business up and create a member of staff against the real
| API, and nothing removed them: twenty-five runs left twenty-four stray
| accounts in the first business, the users screen pages at twenty-five rows,
| and three unrelated specs went red for it.
|
| The command that cleans up deletes a whole business, so what matters here is
| as much what it REFUSES as what it removes. Every test below names the
| target exactly, because a prune that takes patterns is one careless rename
| from deleting a real business.
|
*/

/** A business with a row in each table that points at it. */
function pruneableBusiness(string $name): Business
{
    $business = Business::factory()->create(['name' => $name]);

    CurrentBusiness::get()->run($business->id, function () use ($name): void {
        BusinessSetting::ensureExists(['company_name' => $name, 'currency' => 'KWD']);

        User::factory()->role(Role::Owner)->create(['email' => 'owner+1@e2e.test']);
        $customer = Customer::factory()->create();
        $product = Product::factory()->withStock(10)->create();

        $order = Order::factory()->forCustomer($customer)->create();
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => $product->price,
            'unit_cost' => $product->cost,
            'quantity' => 1,
            'line_discount' => 0,
            'line_total' => 0,
        ]);
    });

    return $business;
}

it('removes a business a browser test created, and everything that belongs to it', function (): void {
    $business = pruneableBusiness('E2E Trading 1793000000000');

    $this->artisan('opsight:e2e:prune', ['--business' => 'E2E Trading 1793000000000'])
        ->assertSuccessful();

    expect(Business::query()->whereKey($business->id)->exists())->toBeFalse();

    // Named one by one: a foreign key left behind is what makes the next
    // migration or the next prune fail, long after the run that caused it.
    foreach (['users', 'customers', 'products', 'orders', 'order_items', 'business_settings', 'inventory_items'] as $table) {
        expect(DB::table($table)->where('business_id', $business->id)->count())
            ->toBe(0, "{$table} still holds rows for the pruned business");
    }
});

it('leaves every other business untouched', function (): void {
    $theirs = pruneableBusiness('E2E Trading 1793000000001');
    $mine = CurrentBusiness::get()->id();

    $before = DB::table('users')->where('business_id', $mine)->count();

    $this->artisan('opsight:e2e:prune', ['--business' => 'E2E Trading 1793000000001'])
        ->assertSuccessful();

    expect(Business::query()->whereKey($mine)->exists())->toBeTrue()
        ->and(DB::table('users')->where('business_id', $mine)->count())->toBe($before)
        ->and(Business::query()->whereKey($theirs->id)->exists())->toBeFalse();
});

it('removes an account and the audit rows that name it', function (): void {
    $staff = User::factory()->role(Role::Staff)->create(['email' => 'e2e.staff+1793000000002@opsight.test']);

    $staff->auditAs('user.password_changed');
    expect(DB::table('activity_logs')->where('subject_id', $staff->id)->where('subject_type', 'User')->count())
        ->toBeGreaterThan(0);

    $this->artisan('opsight:e2e:prune', ['--user' => 'e2e.staff+1793000000002@opsight.test'])
        ->assertSuccessful();

    // Both halves: the row itself, and the entry that would otherwise sit at
    // the top of the activity log saying nobody did it.
    expect(User::query()->whereKey($staff->id)->exists())->toBeFalse()
        ->and(DB::table('activity_logs')->where('user_id', $staff->id)->count())->toBe(0)
        ->and(DB::table('activity_logs')->where('subject_type', 'User')->where('subject_id', $staff->id)->count())->toBe(0);
});

it('refuses a seeded business or a seeded account', function (string $option, string $value): void {
    Business::factory()->create(['name' => 'Opsight Demo Trading', 'slug' => 'default']);
    User::factory()->role(Role::Owner)->create(['email' => 'owner@opsight.test']);

    $this->artisan('opsight:e2e:prune', ["--{$option}" => $value])->assertFailed();

    if ($option === 'business') {
        expect(Business::query()->where('slug', 'default')->exists())->toBeTrue();
    } else {
        expect(User::query()->where('email', $value)->exists())->toBeTrue();
    }
})->with([
    'the first business' => ['business', 'Opsight Demo Trading'],
    'the account the suite signs in with' => ['user', 'owner@opsight.test'],
]);

it('says what it would need when given nothing', function (): void {
    $this->artisan('opsight:e2e:prune')->assertFailed();
});

it('is quiet about something that is already gone', function (): void {
    // A spec that failed before it created anything still runs its afterAll,
    // and must not turn a red test into a red test plus a broken teardown.
    $this->artisan('opsight:e2e:prune', ['--business' => 'E2E Trading 0', '--user' => 'nobody@e2e.test'])
        ->assertSuccessful();
});

it('refuses to run on a production installation', function (): void {
    $business = pruneableBusiness('E2E Trading 1793000000003');

    app()->detectEnvironment(fn () => 'production');

    $this->artisan('opsight:e2e:prune', ['--business' => 'E2E Trading 1793000000003'])->assertFailed();

    expect(Business::query()->whereKey($business->id)->exists())->toBeTrue();
});
