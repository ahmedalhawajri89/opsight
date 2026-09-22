<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\FulfilOrder;
use App\Domain\Orders\RecordRefund;
use App\Models\BusinessSetting;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Value-added tax, through the real order path (ADR-018)
|--------------------------------------------------------------------------
|
| Bahrain's 10% on shelf prices that include it, unless a case says
| otherwise. The point of every case: stored amounts exclude VAT, so revenue
| never includes it, and the customer still pays exactly the shelf price.
|
*/

function vatSettings(array $overrides = []): void
{
    BusinessSetting::current()->forceFill(array_merge([
        'currency' => 'BHD',
        'currency_decimals' => 3,
        'vat_enabled' => true,
        'vat_rate' => '10',
        'prices_include_vat' => true,
    ], $overrides))->save();
    BusinessSetting::flushCache();
}

function vatOrder(array $lines, string $discount = '0'): Order
{
    $order = Order::factory()->create(['discount_amount' => $discount]);

    foreach ($lines as [$price, $quantity, $rate]) {
        $product = Product::factory()->withStock(100)->create(['price' => $price, 'cost' => '0.100', 'vat_rate' => $rate]);
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => $product->price,
            'unit_cost' => $product->cost,
            'quantity' => $quantity,
            'line_discount' => 0,
            'line_total' => 0,
        ]);
    }

    return app(ConfirmOrder::class)($order)->refresh()->load('items');
}

it('changes nothing while VAT is off', function (): void {
    $order = vatOrder([['1.100', 1, null]]);

    expect($order->subtotal_amount)->toBe('1.100')
        ->and($order->tax_amount)->toBe('0.000')
        ->and($order->total_amount)->toBe('1.100')
        ->and($order->items->first()->vat_amount)->toBe('0.000');
});

it('takes VAT out of a shelf price that includes it, and snapshots it', function (): void {
    vatSettings();

    $order = vatOrder([['1.100', 1, null]]);
    $line = $order->items->first();

    expect($line->line_total)->toBe('1.000')
        ->and($line->vat_rate)->toBe('10.00')
        ->and($line->vat_amount)->toBe('0.100')
        ->and($order->subtotal_amount)->toBe('1.000')
        ->and($order->tax_amount)->toBe('0.100')
        ->and($order->prices_include_vat)->toBeTrue()
        // The customer pays the shelf price, not a penny more.
        ->and($order->total_amount)->toBe('1.100');
});

it('adds VAT on top when prices exclude it', function (): void {
    vatSettings(['prices_include_vat' => false]);

    $order = vatOrder([['1.000', 1, null]]);

    expect($order->subtotal_amount)->toBe('1.000')
        ->and($order->tax_amount)->toBe('0.100')
        ->and($order->total_amount)->toBe('1.100')
        ->and($order->prices_include_vat)->toBeFalse();
});

it('uses a product rate over the business rate, including zero', function (): void {
    vatSettings();

    $order = vatOrder([['2.300', 1, '15'], ['5.000', 1, '0']]);
    [$standard, $zeroRated] = $order->items->sortBy('id')->values()->all();

    expect($standard->vat_rate)->toBe('15.00')
        ->and($standard->line_total)->toBe('2.000')
        ->and($standard->vat_amount)->toBe('0.300')
        ->and($zeroRated->vat_rate)->toBe('0.00')
        ->and($zeroRated->vat_amount)->toBe('0.000')
        ->and($order->tax_amount)->toBe('0.300');
});

it('stores an order discount net of VAT, so revenue stays correct', function (): void {
    vatSettings();

    // 11.000 shelf with 1.100 off: the customer pays 9.900, of which 0.900 is VAT.
    $order = vatOrder([['11.000', 1, null]], discount: '1.100');

    expect($order->subtotal_amount)->toBe('10.000')
        ->and($order->discount_amount)->toBe('1.000')
        ->and($order->tax_amount)->toBe('0.900')
        ->and($order->total_amount)->toBe('9.900');
});

it('keeps VAT out of net revenue', function (): void {
    vatSettings();

    $owner = User::factory()->role(Role::Owner)->create();
    $order = vatOrder([['1.100', 3, null]]);
    $day = $order->placed_at->timezone('Asia/Bahrain')->toDateString();

    $this->actingAs($owner)
        ->getJson("/api/v1/analytics/summary?preset=custom&from={$day}&to={$day}")
        ->assertOk()
        ->assertJsonPath('data.net_revenue.value', '3.000');
});

it('splits a refund into the revenue returned and the VAT returned', function (): void {
    vatSettings();

    $order = app(FulfilOrder::class)(vatOrder([['1.100', 1, null]]));
    $refunded = app(RecordRefund::class)($order, '1.100', returnStock: false);

    expect($refunded->refunded_amount)->toBe('1.000')
        ->and($refunded->refunded_vat_amount)->toBe('0.100');

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson("/api/v1/orders/{$refunded->id}")
        ->assertOk()
        ->assertJsonPath('data.refunded_total', '1.100');
});

it('reports VAT charged, refunded and due for a period', function (): void {
    vatSettings();

    $owner = User::factory()->role(Role::Owner)->create();
    $kept = vatOrder([['2.200', 1, null], ['2.300', 1, '15']]);
    $refunded = app(FulfilOrder::class)(vatOrder([['1.100', 1, null]]));
    app(RecordRefund::class)($refunded, '1.100', returnStock: false);
    $day = $kept->placed_at->timezone('Asia/Bahrain')->toDateString();

    $this->actingAs($owner)
        ->getJson("/api/v1/analytics/vat?preset=custom&from={$day}&to={$day}")
        ->assertOk()
        ->assertJsonPath('data.enabled', true)
        // 0.200 + 0.100 at 10%, and 0.300 at 15%.
        ->assertJsonPath('data.output_vat', '0.600')
        ->assertJsonPath('data.refunded_vat', '0.100')
        ->assertJsonPath('data.vat_due', '0.500')
        ->assertJsonPath('data.by_rate.0.rate', '15.00')
        ->assertJsonPath('data.by_rate.0.taxable', '2.000')
        ->assertJsonPath('data.by_rate.1.rate', '10.00')
        ->assertJsonPath('data.by_rate.1.vat', '0.300');
});

it('keeps the VAT report from roles without analytics', function (): void {
    $this->actingAs(User::factory()->role(Role::Staff)->create())
        ->getJson('/api/v1/analytics/vat')
        ->assertForbidden();
});

it('lets an owner switch VAT on and rejects an impossible rate', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner)->patchJson('/api/v1/settings', [
        'vat_enabled' => true,
        'vat_rate' => 10,
        'vat_number' => '200012345600002',
    ])->assertOk()
        ->assertJsonPath('data.vat_enabled', true)
        ->assertJsonPath('data.vat_rate', '10.00')
        ->assertJsonPath('data.vat_number', '200012345600002');

    $this->actingAs($owner)
        ->patchJson('/api/v1/settings', ['vat_rate' => 150])
        ->assertStatus(422)
        ->assertJsonValidationErrors('vat_rate');
});

it('stores a customer VAT number and a product rate', function (): void {
    $owner = User::factory()->role(Role::Owner)->create();
    $customer = Customer::factory()->create();

    $this->actingAs($owner)
        ->patchJson("/api/v1/customers/{$customer->id}", ['vat_number' => '220000111100003'])
        ->assertOk()
        ->assertJsonPath('data.vat_number', '220000111100003');

    $product = Product::factory()->create();

    $this->actingAs($owner)
        ->patchJson("/api/v1/products/{$product->id}", ['vat_rate' => 0])
        ->assertOk()
        ->assertJsonPath('data.vat_rate', '0.00');

    $this->actingAs($owner)
        ->patchJson("/api/v1/products/{$product->id}", ['vat_rate' => 101])
        ->assertStatus(422);
});
