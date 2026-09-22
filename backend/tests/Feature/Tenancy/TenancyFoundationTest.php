<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Support\Money;
use App\Support\Tenancy\CurrentBusiness;
use App\Support\Tenancy\MissingBusinessContext;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| The tenancy foundation (ADR-023)
|--------------------------------------------------------------------------
|
| Every business-owned row knows its business; the business comes from the
| signed-in user; and touching owned data with no business in context is an
| error, never "every business". Full isolation of every endpoint and every
| raw aggregate is proven separately, in TenantIsolationTest.
|
*/

function secondBusiness(string $currency = 'BHD', int $decimals = 3): Business
{
    $business = Business::factory()->create();

    CurrentBusiness::get()->run($business->id, fn () => BusinessSetting::ensureExists([
        'company_name' => $business->name,
        'currency' => $currency,
        'currency_decimals' => $decimals,
    ]));

    return $business;
}

it('refuses to write a business-owned row with no business in context', function (): void {
    CurrentBusiness::get()->forget();

    expect(fn () => Product::factory()->create())->toThrow(MissingBusinessContext::class);

    expect(DB::table('products')->count())->toBe(0);
});

it('refuses to read business-owned rows with no business in context', function (): void {
    Order::factory()->create();
    CurrentBusiness::get()->forget();

    // Not an empty list and not every business's orders: an error.
    expect(fn () => Order::query()->count())->toThrow(MissingBusinessContext::class);
});

it('writes a new row into the business in context', function (): void {
    $other = secondBusiness();

    $product = CurrentBusiness::get()->run($other->id, fn () => Product::factory()->create());

    expect($product->business_id)->toBe($other->id)
        ->and(Product::query()->whereKey($product->id)->exists())->toBeFalse()
        ->and(CurrentBusiness::get()->run($other->id, fn () => Product::query()->whereKey($product->id)->exists()))->toBeTrue();
});

it('restores the previous business after running as another', function (): void {
    $before = CurrentBusiness::get()->id();
    $other = secondBusiness();

    expect(fn () => CurrentBusiness::get()->run($other->id, fn () => throw new RuntimeException('x')))
        ->toThrow(RuntimeException::class);

    expect(CurrentBusiness::get()->id())->toBe($before);
});

it('reads each business its own settings and currency places', function (): void {
    $kuwait = secondBusiness('KWD', 3);
    $saudi = secondBusiness('SAR', 2);

    expect(CurrentBusiness::get()->run($kuwait->id, fn () => [BusinessSetting::current()->currency, Money::zero()]))
        ->toBe(['KWD', '0.000'])
        ->and(CurrentBusiness::get()->run($saudi->id, fn () => [BusinessSetting::current()->currency, Money::zero()]))
        ->toBe(['SAR', '0.00']);
});

it('takes the business from the account that signs in', function (): void {
    $other = secondBusiness();

    [$user, $theirs] = CurrentBusiness::get()->run($other->id, fn () => [
        User::factory()->role(Role::Owner)->create(['email' => 'owner@second.test']),
        Order::factory()->create(),
    ]);
    $ours = Order::factory()->create();

    $this->postJson('/api/v1/auth/login', ['email' => 'owner@second.test', 'password' => 'password'])->assertOk();

    // A fresh request, with nothing left in context but the session cookie.
    CurrentBusiness::get()->forget();
    $this->asNewRequest();

    $ids = collect($this->getJson('/api/v1/orders')->assertOk()->json('data'))->pluck('id');

    expect($ids->all())->toBe([$theirs->id])
        ->and(CurrentBusiness::get()->id())->toBe($user->business_id);

    $this->getJson("/api/v1/orders/{$ours->id}")->assertNotFound();
});

it('files a failed sign-in under the attacked account\'s business, or none', function (): void {
    $other = secondBusiness();
    CurrentBusiness::get()->run($other->id, fn () => User::factory()->create(['email' => 'target@second.test']));
    CurrentBusiness::get()->forget();

    $this->postJson('/api/v1/auth/login', ['email' => 'target@second.test', 'password' => 'wrong-password'])->assertUnprocessable();
    $this->postJson('/api/v1/auth/login', ['email' => 'nobody@nowhere.test', 'password' => 'wrong-password'])->assertUnprocessable();

    $rows = ActivityLog::withoutGlobalScopes()->where('action', 'auth.login_failed')->get();

    expect($rows->firstWhere('context.email', 'target@second.test')?->business_id)->toBe($other->id)
        ->and($rows->firstWhere('context.email', 'nobody@nowhere.test')?->business_id)->toBeNull();
});

it('starts every request and job with no business in context', function (): void {
    expect(CurrentBusiness::get()->idOrNull())->not->toBeNull();

    // What a worker does between requests and between jobs.
    app()->forgetScopedInstances();

    expect(CurrentBusiness::get()->idOrNull())->toBeNull();
});
