<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\ConfirmOrder;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Names in Arabic, and phones in one form (ADR-021)
|--------------------------------------------------------------------------
*/

function readerIn(string $locale): User
{
    return User::factory()->role(Role::Owner)->create(['locale' => $locale]);
}

it('shows an Arabic reader the Arabic name, and everyone else the name', function (): void {
    $product = Product::factory()->create(['name' => 'Wireless Headphones', 'name_ar' => 'سماعات لاسلكية']);

    $this->actingAs(readerIn('ar'))->getJson("/api/v1/products/{$product->id}")
        ->assertOk()
        ->assertJsonPath('data.name', 'Wireless Headphones')
        ->assertJsonPath('data.name_ar', 'سماعات لاسلكية')
        ->assertJsonPath('data.display_name', 'سماعات لاسلكية');

    $this->actingAs(readerIn('en'))->getJson("/api/v1/products/{$product->id}")
        ->assertOk()
        ->assertJsonPath('data.display_name', 'Wireless Headphones');
});

it('falls back to the name when there is no Arabic one', function (): void {
    $product = Product::factory()->create(['name' => 'Desk Lamp', 'name_ar' => null]);

    $this->actingAs(readerIn('ar'))->getJson("/api/v1/products/{$product->id}")
        ->assertOk()
        ->assertJsonPath('data.display_name', 'Desk Lamp');
});

it('snapshots the Arabic name at confirm, so a later rename does not rewrite history', function (): void {
    $product = Product::factory()->withStock(10)->create(['name' => 'Chair', 'name_ar' => 'كرسي']);
    $order = Order::factory()->create();
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
    app(ConfirmOrder::class)($order);

    $product->update(['name_ar' => 'كرسي مكتب']);

    $this->actingAs(readerIn('ar'))->getJson("/api/v1/orders/{$order->id}")
        ->assertOk()
        ->assertJsonPath('data.items.0.display_name', 'كرسي');
});

it('names products in Arabic in the revenue breakdown for an Arabic reader', function (): void {
    $product = Product::factory()->withStock(10)->create(['name' => 'Chair', 'name_ar' => 'كرسي']);
    $order = Order::factory()->create();
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
    $confirmed = app(ConfirmOrder::class)($order);
    $day = $confirmed->placed_at->timezone('Asia/Bahrain')->toDateString();

    $this->actingAs(readerIn('ar'))
        ->getJson("/api/v1/analytics/breakdown?dimension=product&metric=net_revenue&preset=custom&from={$day}&to={$day}")
        ->assertOk()
        ->assertJsonPath('data.0.label', 'كرسي');
});

it('stores a customer phone in E.164, using the customer country', function (): void {
    $this->actingAs(readerIn('en'))
        ->postJson('/api/v1/customers', ['name' => 'Al Noor Trading', 'name_ar' => 'النور للتجارة', 'country' => 'BH', 'phone' => '3600 1234'])
        ->assertCreated()
        ->assertJsonPath('data.phone', '+97336001234')
        ->assertJsonPath('data.name_ar', 'النور للتجارة');
});

it('refuses a phone it cannot place, in the reader language', function (): void {
    $this->actingAs(readerIn('ar'))
        ->postJson('/api/v1/customers', ['name' => 'Unknown', 'phone' => '3600 1234'])
        ->assertStatus(422)
        ->assertJsonPath('errors.phone.0', 'تعذّرت قراءة الهاتف كرقم هاتف. أضف رمز الدولة، أو حدّد دولة العميل.');
});

it('normalises a phone on update, using the country already on record', function (): void {
    $customer = Customer::factory()->create(['country' => 'SA']);

    $this->actingAs(readerIn('en'))
        ->patchJson("/api/v1/customers/{$customer->id}", ['phone' => '050 123 4567'])
        ->assertOk()
        ->assertJsonPath('data.phone', '+966501234567');
});
