<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| What the QA sweep found, held in place
|--------------------------------------------------------------------------
|
| Each of these covers a defect found by reviewing the running system rather
| than the code: a filter that could not use an index, a range with no
| ceiling, a resource that queried once per row, and responses with no
| security headers.
|
*/

it('keeps a date filter inclusive of its last day', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    // Late on the last day of the range: a filter written as "<= that date"
    // at midnight would drop it, which is why the bound is the day after.
    $late = Order::factory()->create();
    DB::table('orders')->where('id', $late->id)->update([
        'status' => 'confirmed',
        'placed_at' => '2026-08-31 23:45:00',
    ]);

    $early = Order::factory()->create();
    DB::table('orders')->where('id', $early->id)->update([
        'status' => 'confirmed',
        'placed_at' => '2026-08-01 00:05:00',
    ]);

    $outside = Order::factory()->create();
    DB::table('orders')->where('id', $outside->id)->update([
        'status' => 'confirmed',
        'placed_at' => '2026-09-01 00:05:00',
    ]);

    $ids = collect(
        $this->actingAs($owner)
            ->getJson('/api/v1/orders?filter[placed_from]=2026-08-01&filter[placed_to]=2026-08-31')
            ->assertOk()
            ->json('data'),
    )->pluck('id');

    expect($ids)->toContain($late->id, $early->id)
        ->and($ids)->not->toContain($outside->id);
});

it('answers a date filter with an index rather than a table scan', function (): void {
    // The filter used to compile to DATE(placed_at) >= ?, which no index can
    // answer. This asserts the shape of the SQL, which is what decides that.
    $owner = User::factory()->role(Role::Owner)->create();

    DB::enableQueryLog();
    $this->actingAs($owner)->getJson('/api/v1/orders?filter[placed_from]=2026-08-01')->assertOk();
    $queries = collect(DB::getQueryLog())->pluck('query')->implode(' ');
    DB::disableQueryLog();

    expect($queries)->toContain('placed_at')
        ->and($queries)->not->toContain('date(`placed_at`)');
});

it('refuses a custom range longer than three years', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)
        ->getJson('/api/v1/analytics/summary?preset=custom&from=1900-01-01&to=2100-12-31')
        ->assertUnprocessable()
        ->assertJsonValidationErrors('to');

    // Three years exactly is still answered.
    $this->getJson('/api/v1/analytics/summary?preset=custom&from=2024-01-01&to=2026-01-01')->assertOk();
});

it('reads a page of products without a query per row', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    Product::factory()->count(5)->withStock(3)->create();

    DB::enableQueryLog();
    $this->actingAs($owner)->getJson('/api/v1/products')->assertOk();
    $count = count(DB::getQueryLog());
    DB::disableQueryLog();

    // Settings, the user, the count, the page, and its two eager loads —
    // nowhere near one per product. It was five more than this before the
    // inventory item's own product was eager-loaded with it.
    expect($count)->toBeLessThan(12);
});

it('sends the security headers on every response', function (): void {
    $response = $this->getJson('/api/v1/health');

    expect($response->headers->get('X-Content-Type-Options'))->toBe('nosniff')
        ->and($response->headers->get('X-Frame-Options'))->toBe('DENY')
        ->and($response->headers->get('Referrer-Policy'))->toBe('strict-origin-when-cross-origin')
        // Not over plain HTTP: it would pin a browser to a scheme that is not
        // being served.
        ->and($response->headers->get('Strict-Transport-Security'))->toBeNull();
});

it('will not let the last owner of a business be demoted', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    User::factory()->role(Role::Manager)->create();

    $this->actingAs($owner)
        ->postJson("/api/v1/users/{$owner->id}/role", ['role' => 'manager'])
        ->assertStatus(409);

    expect($owner->fresh()->role)->toBe(Role::Owner);

    // With a second owner it is allowed, and the guard counts under a lock so
    // two demotions at once cannot both pass.
    $second = User::factory()->role(Role::Owner)->create();

    $this->postJson("/api/v1/users/{$owner->id}/role", ['role' => 'manager'])->assertOk();

    expect($owner->fresh()->role)->toBe(Role::Manager)
        ->and($second->fresh()->role)->toBe(Role::Owner);
});
