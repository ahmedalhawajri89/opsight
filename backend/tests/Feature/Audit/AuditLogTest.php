<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Audit\AuditRedactor;
use App\Domain\Inventory\AdjustStock;
use App\Domain\Orders\CancelOrder;
use App\Domain\Orders\ConfirmOrder;
use App\Http\Resources\ActivityLogResource;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\InventoryMovement;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Audit log
|--------------------------------------------------------------------------
|
| SECURITY.md §10. The claim under test is not "some things are logged" but
| that a write CANNOT happen without being logged, because the mechanism is an
| observer on the model rather than a line somebody remembered to add to a
| controller.
|
*/

function lastLog(string $action): ?ActivityLog
{
    return ActivityLog::query()->where('action', $action)->latest('id')->first();
}

it('records a creation with the created attributes as the diff', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->postJson('/api/v1/customers', [
        'name' => 'Gulf Trading',
        'email' => 'accounts@gulf.test',
    ])->assertCreated();

    $log = lastLog('customer.created');

    expect($log)->not->toBeNull()
        ->and($log->user_id)->toBe($owner->id)
        ->and($log->subject_type)->toBe('Customer')
        ->and($log->changes['after']['name'])->toBe('Gulf Trading')
        // Nothing existed before a creation. An empty before is the honest
        // shape, not a copy of the after.
        ->and($log->changes['before'])->toBe([]);
});

it('records only the attributes that actually changed', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $customer = Customer::factory()->create(['name' => 'Old Name', 'city' => 'Manama']);

    $this->actingAs($owner)
        ->patchJson("/api/v1/customers/{$customer->id}", ['name' => 'New Name'])
        ->assertOk();

    $log = lastLog('customer.updated');

    expect($log->changes['before'])->toBe(['name' => 'Old Name'])
        ->and($log->changes['after'])->toBe(['name' => 'New Name'])
        // A full row snapshot would bury the one field that moved under
        // fifteen that did not.
        ->and($log->changes['after'])->not->toHaveKey('city');
});

it('does not write a row when nothing meaningful changed', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $customer = Customer::factory()->create(['name' => 'Same Name']);

    $before = ActivityLog::query()->count();

    $this->actingAs($owner)
        ->patchJson("/api/v1/customers/{$customer->id}", ['name' => 'Same Name'])
        ->assertOk();

    expect(ActivityLog::query()->count())->toBe($before);
});

/*
 * The reason the override mechanism exists. `order.updated` with a status diff
 * is technically true and tells a reader nothing about WHY, and the
 * cancellation reason has nowhere else to live.
 */
it('names an order transition rather than logging it as a generic update', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $this->actingAs($owner);

    $product = Product::factory()->priced(100.0000, 40.0000)->withStock(10)->create();
    $order = Order::factory()->create();
    $order->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => $product->price,
        'unit_cost' => $product->cost,
        'quantity' => 2,
        'line_discount' => 0,
        'line_total' => 0,
    ]);

    app(ConfirmOrder::class)($order, $owner->id);
    app(CancelOrder::class)($order->refresh(), 'Customer changed their mind', $owner->id);

    expect(lastLog('order.confirmed'))->not->toBeNull()
        ->and(lastLog('order.updated'))->toBeNull();

    $cancelled = lastLog('order.cancelled');

    expect($cancelled)->not->toBeNull()
        ->and($cancelled->context['reason'])->toBe('Customer changed their mind');
});

it('does not write a row per line item when an order is confirmed', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $this->actingAs($owner);

    $order = Order::factory()->create();

    foreach (range(1, 3) as $i) {
        $product = Product::factory()->priced(50.0000, 20.0000)->withStock(10)->create();
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
    }

    ActivityLog::query()->delete();

    app(ConfirmOrder::class)($order, $owner->id);

    // One order row. The snapshot writes on three lines and three stock
    // movements are all part of confirming, and `order.confirmed` accounts
    // for them by name.
    expect(ActivityLog::query()->count())->toBe(1)
        ->and(ActivityLog::query()->first()->action)->toBe('order.confirmed');
});

it('audits a manual stock adjustment, which has no other record of who did it', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $this->actingAs($owner);

    $product = Product::factory()->withStock(10)->create();

    ActivityLog::query()->delete();

    app(AdjustStock::class)->adjust(
        product: $product,
        delta: -3,
        note: 'Water damage in transit',
        reason: InventoryMovement::REASON_DAMAGE,
        actorId: $owner->id,
    );

    $log = lastLog('inventory.created');

    expect($log)->not->toBeNull()
        ->and($log->subject_type)->toBe('InventoryMovement');
});

/* -------------------------------------------------------------------------- */
/* Authentication */
/* -------------------------------------------------------------------------- */

it('audits a successful sign-in', function (): void {
    $user = User::factory()->role(Role::Manager)->create(['email' => 'layla@opsight.test']);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'layla@opsight.test',
        'password' => 'password',
    ])->assertOk();

    $log = lastLog('auth.login');

    expect($log)->not->toBeNull()->and($log->user_id)->toBe($user->id);
});

it('audits a failed sign-in with the attempted address but no actor', function (): void {
    User::factory()->create(['email' => 'layla@opsight.test']);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'layla@opsight.test',
        'password' => 'wrong-password',
    ])->assertStatus(422);

    $log = lastLog('auth.login_failed');

    expect($log)->not->toBeNull()
        // Whoever submitted that did not prove they are the account holder.
        // Attributing the row to the user would be a false statement.
        ->and($log->user_id)->toBeNull()
        ->and($log->context['email'])->toBe('layla@opsight.test');
});

it('never records the submitted password, in any form', function (): void {
    User::factory()->create(['email' => 'layla@opsight.test']);

    $this->postJson('/api/v1/auth/login', [
        'email' => 'layla@opsight.test',
        'password' => 'hunter2-the-real-one',
    ])->assertStatus(422);

    $rows = ActivityLog::query()->get();

    foreach ($rows as $row) {
        $raw = json_encode([$row->changes, $row->context]);

        expect($raw)->not->toContain('hunter2-the-real-one');

        foreach (array_keys($row->context ?? []) as $key) {
            expect(AuditRedactor::isRedacted((string) $key))->toBeFalse();
        }
    }
});

it('audits a lockout once the login limiter engages', function (): void {
    User::factory()->create(['email' => 'layla@opsight.test']);

    foreach (range(1, 6) as $ignored) {
        $this->postJson('/api/v1/auth/login', [
            'email' => 'layla@opsight.test',
            'password' => 'wrong-password',
        ]);
    }

    expect(lastLog('auth.lockout'))->not->toBeNull();
});

it('records a password change as its own action with an empty diff', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $target = User::factory()->role(Role::Staff)->create();

    $this->actingAs($owner)->patchJson("/api/v1/users/{$target->id}", [
        'password' => 'a-long-enough-password',
        'password_confirmation' => 'a-long-enough-password',
    ])->assertOk();

    $log = lastLog('user.password_changed');

    expect($log)->not->toBeNull()
        // The fact it changed is the auditable event. The value is not in the
        // row, hashed or otherwise.
        ->and(json_encode($log->changes))->not->toContain('password');
});

/* -------------------------------------------------------------------------- */
/* Reading the log */
/* -------------------------------------------------------------------------- */

it('refuses the activity log to a role without activity.view', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($staff)->getJson('/api/v1/activity')->assertForbidden();
});

it('pages the activity log with a cursor, not an offset', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    Customer::factory()->count(30)->create();

    $response = $this->actingAs($owner)->getJson('/api/v1/activity?per_page=10')->assertOk();

    expect($response->json('meta.next_cursor'))->not->toBeNull()
        // Cursor pagination offers no page count and no total, by design: an
        // OFFSET into the highest-growth table in the system gets slower
        // exactly as the table fills up.
        ->and($response->json('meta'))->not->toHaveKey('total')
        ->and($response->json('meta'))->not->toHaveKey('last_page');
});

it('walks the whole log through the cursor without dropping a row', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    /*
     * Created in one operation, so many rows share a created_at to the second.
     * Without the id tiebreaker on the cursor ordering, the seek lands
     * mid-group and the rows after it in that second are silently skipped —
     * an audit log that omits entries when paged is not an audit log.
     */
    Customer::factory()->count(25)->create();

    $expected = ActivityLog::query()->count();

    $seen = [];
    $url = '/api/v1/activity?per_page=5';

    while ($url !== null) {
        $page = $this->actingAs($owner)->getJson($url)->assertOk();

        foreach ($page->json('data') as $row) {
            $seen[] = $row['id'];
        }

        $cursor = $page->json('meta.next_cursor');
        $url = $cursor === null ? null : '/api/v1/activity?per_page=5&cursor='.$cursor;
    }

    expect($seen)->toHaveCount($expected)
        ->and(array_unique($seen))->toHaveCount($expected);
});

/*
 * The audit log is a back door to cost data, and this is the test that closes
 * it. Every other surface redacts cost by omitting it from a resource; a diff
 * of `{"before":{"cost":"4.20"},"after":{"cost":"4.80"}}` would quietly undo
 * all of that on a screen reached by a different ability.
 */
it('strips cost figures from a diff for a reader who may not see cost', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $product = Product::factory()->priced(100.0000, 40.0000)->create();

    $this->actingAs($owner)->patchJson("/api/v1/products/{$product->id}", [
        'cost' => 48.0000,
    ])->assertOk();

    $costBlind = User::factory()->role(Role::Staff)->create();
    // Staff cannot reach the log at all, so the redaction is exercised through
    // the resource directly — the guarantee has to hold for any future role
    // that gains activity.view without gaining products.view_cost.
    $log = lastLog('product.updated');

    $rendered = (new ActivityLogResource($log))
        ->toArray(tap(request(), fn ($r) => $r->setUserResolver(fn () => $costBlind)));

    expect(json_encode($rendered['changes']))->not->toContain('cost');

    $rendered = (new ActivityLogResource($log))
        ->toArray(tap(request(), fn ($r) => $r->setUserResolver(fn () => $owner)));

    expect($rendered['changes']['after'])->toHaveKey('cost');
});

it('exposes no route that writes to the log', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $log = ActivityLog::query()->create(['action' => 'test.created']);

    // 405 where the path exists and only GET is routed; 404 where no write
    // path was ever declared at all. Neither one reaches a controller.
    $this->actingAs($owner)->postJson('/api/v1/activity', [])->assertStatus(405);
    $this->actingAs($owner)->patchJson("/api/v1/activity/{$log->id}", [])->assertStatus(404);
    $this->actingAs($owner)->deleteJson("/api/v1/activity/{$log->id}")->assertStatus(404);
});
