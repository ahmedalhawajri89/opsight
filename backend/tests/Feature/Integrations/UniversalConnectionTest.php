<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\ApiKey;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Order;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;

/*
|--------------------------------------------------------------------------
| The universal connection (2026-11-13)
|--------------------------------------------------------------------------
|
| Any system sends orders with a key: Shopify, WooCommerce, a till, or
| Zapier and Make in between. The key names the business; the same id sent
| twice is one order; only the hash is stored.
|
*/

function inboundPayload(array $overrides = []): array
{
    return array_replace_recursive([
        'id' => 'WOO-1001',
        'placed_at' => now()->subDay()->toIso8601String(),
        'status' => 'fulfilled',
        'customer' => ['name' => 'Sara Ali', 'email' => 'sara@example.test'],
        'lines' => [
            ['sku' => 'MUG-1', 'name' => 'Mug', 'quantity' => 2, 'unit_price' => '4.500'],
            ['name' => 'Gift wrap', 'quantity' => 1, 'unit_price' => 1],
        ],
        'shipping' => '2',
        'paid' => '12',
        'payment_method' => 'card',
    ], $overrides);
}

function issueKey(string $name = 'WooCommerce'): string
{
    [, $secret] = ApiKey::issue($name, null);

    return $secret;
}

it('records an order sent with a key, as the store would', function (): void {
    $secret = issueKey();

    $response = $this->withToken($secret)->postJson('/api/v1/inbound/orders', inboundPayload())
        ->assertCreated()
        ->assertJsonPath('data.id', 'WOO-1001')
        ->assertJsonPath('data.created', true);

    $order = Order::query()->where('source', 'api')->where('external_id', 'WOO-1001')->firstOrFail();

    // 2 × 4.5 + 1 + 2 shipping = 12.
    expect((string) $order->total_amount)->toBe('12.000')
        ->and($order->items()->count())->toBe(2)
        ->and($response->json('data.reference'))->toBe($order->reference)
        ->and(ApiKey::query()->first()->orders_received)->toBe(1);
});

it('treats the same id sent again as the same order, not a second one', function (): void {
    $secret = issueKey();

    $this->withToken($secret)->postJson('/api/v1/inbound/orders', inboundPayload())->assertCreated();
    $this->withToken($secret)->postJson('/api/v1/inbound/orders', inboundPayload(['status' => 'cancelled']))
        ->assertOk()
        ->assertJsonPath('data.created', false);

    expect(Order::query()->where('external_id', 'WOO-1001')->count())->toBe(1)
        ->and(ApiKey::query()->first()->orders_received)->toBe(1);
});

it('refuses a missing, wrong or revoked key in the same words', function (): void {
    $secret = issueKey();

    $this->postJson('/api/v1/inbound/orders', inboundPayload())->assertUnauthorized();
    $this->withToken('bydr_nottherealkey_0000000000')->postJson('/api/v1/inbound/orders', inboundPayload())->assertUnauthorized();

    ApiKey::query()->update(['revoked_at' => now()]);

    $this->withToken($secret)->postJson('/api/v1/inbound/orders', inboundPayload())->assertUnauthorized();

    expect(Order::query()->where('source', 'api')->count())->toBe(0);
});

it('says which field it could not read', function (): void {
    $this->withToken(issueKey())
        ->postJson('/api/v1/inbound/orders', ['id' => 'X', 'placed_at' => 'yesterday-ish', 'lines' => []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['placed_at', 'lines']);
});

it('files the order under the key\'s business, whatever the sender claims', function (): void {
    $other = Business::factory()->create();
    $secret = CurrentBusiness::get()->run($other->id, function (): string {
        BusinessSetting::ensureExists(['company_name' => 'Other']);

        return issueKey('Their till');
    });

    $this->withToken($secret)
        ->postJson('/api/v1/inbound/orders', inboundPayload(['business_id' => 1]))
        ->assertCreated();

    // Not in this business…
    expect(Order::query()->where('source', 'api')->count())->toBe(0);

    // …but in theirs.
    CurrentBusiness::get()->run($other->id, function (): void {
        expect(Order::query()->where('source', 'api')->count())->toBe(1);
    });
});

it('lets the owner make a key, shows it once, and keeps only its hash', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $made = $this->actingAs($owner)->postJson('/api/v1/integrations/api-keys', ['name' => 'Zapier'])
        ->assertCreated();

    $secret = $made->json('data.secret');
    $key = ApiKey::query()->firstOrFail();

    expect($secret)->toStartWith('bydr_')
        ->and($key->hash)->toBe(hash('sha256', $secret))
        ->and($key->getAttributes())->not->toContain($secret);

    // Listed by prefix only, never in full again.
    $this->actingAs($owner)->getJson('/api/v1/integrations/api-keys')
        ->assertOk()
        ->assertJsonMissingPath('data.0.secret')
        ->assertJsonPath('data.0.prefix', $key->prefix);

    $this->actingAs($owner)->deleteJson("/api/v1/integrations/api-keys/{$key->id}")->assertNoContent();

    expect($key->fresh()->revoked_at)->not->toBeNull()
        ->and(ActivityLog::query()->whereIn('action', ['integration.api_key_created', 'integration.api_key_revoked'])->count())->toBe(2);
});

it('keeps keys from anyone who may not manage integrations', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($staff)->getJson('/api/v1/integrations/api-keys')->assertForbidden();
    $this->actingAs($staff)->postJson('/api/v1/integrations/api-keys', ['name' => 'x'])->assertForbidden();
});

it('says whether each store app is set up on this installation, never how', function (): void {
    config(['integrations.salla.client_id' => 'id', 'integrations.salla.client_secret' => 'secret']);
    config(['integrations.zid.client_id' => null, 'integrations.zid.client_secret' => null]);

    $response = $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson('/api/v1/integrations')
        ->assertOk()
        ->assertJsonPath('meta.available.salla', true)
        ->assertJsonPath('meta.available.zid', false);

    expect($response->getContent())->not->toContain('secret');
});
