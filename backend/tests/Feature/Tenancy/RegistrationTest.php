<?php

declare(strict_types=1);

use App\Authorization\Ability;
use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\RateLimiter;

/*
|--------------------------------------------------------------------------
| A business signs itself up (ADR-024)
|--------------------------------------------------------------------------
*/

/** @return array<string, string> */
function signUp(array $overrides = []): array
{
    return array_merge([
        'business_name' => 'Gulf Pearl Trading',
        'name' => 'Maryam Al Khalifa',
        'email' => 'maryam@gulfpearl.test',
        'password' => 'a-long-enough-passphrase',
    ], $overrides);
}

beforeEach(function (): void {
    RateLimiter::clear('register');
    // The test's own business is in context from setUp; sign-up must not rely on it.
    CurrentBusiness::get()->forget();
});

it('creates the business, its settings and its owner, and signs the owner in', function (): void {
    $response = $this->postJson('/api/v1/auth/register', signUp())->assertCreated();

    $business = Business::query()->where('name', 'Gulf Pearl Trading')->sole();

    $response->assertJsonPath('data.email', 'maryam@gulfpearl.test')
        ->assertJsonPath('data.role', 'owner')
        ->assertJsonPath('data.business.id', $business->id)
        ->assertJsonPath('data.business.name', 'Gulf Pearl Trading')
        ->assertJsonPath('data.business.onboarded', false);

    expect($response->json('data.abilities'))->toBe(array_map(fn (Ability $a): string => $a->value, Ability::cases()));

    // Signed in: the session answers /me as the new owner, in the new business.
    CurrentBusiness::get()->forget();
    $this->asNewRequest()->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.business.id', $business->id);

    CurrentBusiness::get()->run($business->id, function (): void {
        expect(BusinessSetting::current()->company_name)->toBe('Gulf Pearl Trading')
            ->and(User::query()->sole()->role)->toBe(Role::Owner)
            ->and(ExpenseCategory::query()->count())->toBe(7)
            ->and(Order::query()->count())->toBe(0)
            ->and(ActivityLog::query()->where('action', 'business.registered')->count())->toBe(1);
    });
});

it('names the starting expense categories in the owner\'s language', function (): void {
    $this->postJson('/api/v1/auth/register', signUp(['locale' => 'ar']))->assertCreated();

    $business = Business::query()->where('name', 'Gulf Pearl Trading')->sole();

    $names = CurrentBusiness::get()->run($business->id, fn () => ExpenseCategory::query()->pluck('name')->all());

    expect($names)->toContain('الإيجار', 'الرواتب');
});

it('refuses an email that already has an account, and creates nothing', function (): void {
    // An account in another business: emails are unique across all of them.
    $existing = CurrentBusiness::get()->run(
        Business::query()->where('slug', 'opsight-test')->value('id'),
        fn () => User::factory()->create(['email' => 'taken@opsight.test'])->email,
    );

    $before = Business::query()->count();

    $this->postJson('/api/v1/auth/register', signUp(['email' => $existing]))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('email');

    expect(Business::query()->count())->toBe($before);
});

it('holds the password to the same policy as every account', function (): void {
    $this->postJson('/api/v1/auth/register', signUp(['password' => 'short']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('password');

    expect(Business::query()->where('name', 'Gulf Pearl Trading')->exists())->toBeFalse();
});

it('leaves nothing behind when any part of sign-up fails', function (): void {
    $businesses = Business::query()->count();
    $users = DB::table('users')->count();
    $settings = DB::table('business_settings')->count();

    // The last step of the transaction fails.
    ExpenseCategory::creating(static fn () => throw new RuntimeException('disk full'));

    $this->postJson('/api/v1/auth/register', signUp())->assertStatus(500);

    expect(Business::query()->count())->toBe($businesses)
        ->and(DB::table('users')->count())->toBe($users)
        ->and(DB::table('business_settings')->count())->toBe($settings)
        ->and(DB::table('users')->where('email', 'maryam@gulfpearl.test')->exists())->toBeFalse();
});

it('limits sign-ups from one address', function (): void {
    foreach (range(1, 5) as $i) {
        $this->postJson('/api/v1/auth/register', signUp(['email' => "owner{$i}@limit.test"]))->assertCreated();
        CurrentBusiness::get()->forget();
        $this->asNewRequest();
        $this->postJson('/api/v1/auth/logout');
    }

    $this->postJson('/api/v1/auth/register', signUp(['email' => 'owner6@limit.test']))->assertStatus(429);
});

it('starts a new business with nothing in it', function (): void {
    $this->postJson('/api/v1/auth/register', signUp())->assertCreated();

    expect($this->getJson('/api/v1/orders')->assertOk()->json('meta.total'))->toBe(0)
        ->and($this->getJson('/api/v1/customers')->assertOk()->json('meta.total'))->toBe(0)
        ->and($this->getJson('/api/v1/products')->assertOk()->json('meta.total'))->toBe(0);

    // An empty business has no revenue: an absence, not a zero that looks
    // like a bad month.
    $this->getJson('/api/v1/analytics/summary?preset=30d')->assertOk()
        ->assertJsonPath('data.orders_count.value', 0);
});

/*
|--------------------------------------------------------------------------
| The setup wizard's last step
|--------------------------------------------------------------------------
*/

it('records where the business trades and that setup is done', function (): void {
    $this->postJson('/api/v1/auth/register', signUp())->assertCreated();

    $this->postJson('/api/v1/onboarding/complete', ['country' => 'KW'])
        ->assertOk()
        ->assertJsonPath('data.business.onboarded', true)
        ->assertJsonPath('data.business.country', 'KW');
});

it('offers only the markets it supports', function (): void {
    $this->postJson('/api/v1/auth/register', signUp())->assertCreated();

    $this->postJson('/api/v1/onboarding/complete', ['country' => 'XX'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('country');
});

it('lets only the owner finish setup', function (): void {
    $this->postJson('/api/v1/auth/register', signUp())->assertCreated();
    $business = Business::query()->where('name', 'Gulf Pearl Trading')->sole();

    $staff = CurrentBusiness::get()->run($business->id, fn () => User::factory()->role(Role::Staff)->create());

    $this->actingAs($staff)->postJson('/api/v1/onboarding/complete', ['country' => 'KW'])->assertForbidden();

    expect($business->fresh()->onboarded_at)->toBeNull();
});
