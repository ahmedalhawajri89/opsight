<?php

declare(strict_types=1);

use App\Domain\Integrations\Zid\ImportZidOrder;
use App\Domain\Integrations\Zid\ImportZidProduct;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\Product;

/*
|--------------------------------------------------------------------------
| One Zid order, and one Zid product, as Baydar's (ADR-037)
|--------------------------------------------------------------------------
|
| Payloads shaped from Zid's List Orders and List Products documentation:
| the money breakdown as `payment.invoice` lines, unit prices before VAT as
| `net_price`, the phone as digits with no plus, and long decimal strings
| where a float would have been simpler for Zid and worse for us.
|
| The default business trades in Bahraini dinars, three places, so stored
| totals read as '115.000'.
|
*/

/** @param array<string, mixed> $overrides */
function zidOrder(array $overrides = []): array
{
    $lists = array_intersect_key($overrides, array_flip(['products']));

    return array_replace(array_replace_recursive([
        'id' => 64102971,
        'code' => 'ZD-64102971',
        'store_id' => 98765,
        'order_status' => ['code' => 'delivered', 'name' => 'تم التوصيل'],
        'payment_status' => 'paid',
        'created_at' => '2026-06-26 22:30:00',
        'currency_code' => 'SAR',
        'order_total' => '115.00',
        'customer' => [
            'id' => 1441,
            'name' => 'Sara Ahmed',
            'email' => 'sara@example.test',
            'mobile' => '966501806978',
        ],
        'payment' => [
            'method' => ['code' => 'zid_credit_card', 'name' => 'Credit Card', 'type' => 'card'],
            'invoice' => [
                ['code' => 'sub_totals_before_vat', 'value' => '86.95652128843400000', 'title' => 'Total without VAT'],
                ['code' => 'shipping', 'value' => '15.00', 'title' => 'Shipping'],
                ['code' => 'vat', 'value' => '13.04347819326500000', 'title' => 'VAT (%15)'],
                ['code' => 'total', 'value' => '115.00', 'title' => 'Total'],
            ],
        ],
        'products' => [[
            'id' => '003140e2-9d8e-462d-b823-373407746871',
            'sku' => 'BROW-KIT',
            'name' => 'طقم حواجب',
            'quantity' => 2,
            'net_price' => 43.478260644217,
            'price' => 49.99999974085,
            'total' => 99.9999994817,
        ]],
    ], $overrides), $lists);
}

function importZid(array $overrides = []): Order
{
    return app(ImportZidOrder::class)(zidOrder($overrides));
}

it('writes Zid\'s own breakdown, from the invoice lines', function (): void {
    $order = importZid();

    expect($order->subtotal_amount)->toBe('86.957')
        ->and($order->shipping_amount)->toBe('15.000')
        ->and($order->tax_amount)->toBe('13.043')
        ->and($order->total_amount)->toBe('115.000')
        ->and($order->source)->toBe('zid')
        ->and($order->external_id)->toBe('64102971');
});

it('writes a line before VAT, so it reads the way the catalogue does', function (): void {
    $line = importZid()->items()->sole();

    // net_price × quantity, not `total`, which includes the tax.
    expect($line->line_total)->toBe('86.957')
        ->and($line->unit_price)->toBe('43.4780')
        ->and($line->quantity)->toBe(2)
        ->and($line->product_sku)->toBe('BROW-KIT');
});

it('places the order in Riyadh time, which can be the next day in UTC terms', function (): void {
    /*
     * 22:30 in Riyadh is 19:30 UTC on the same day. Read as UTC it would be
     * 22:30 UTC — 01:30 the next morning in Riyadh — and the sale would be
     * counted on the wrong day.
     */
    expect(importZid()->placed_at->toIso8601String())->toBe('2026-06-26T19:30:00+00:00');
});

it('records what was paid, for an order Zid calls paid', function (): void {
    $payment = importZid()->payments()->sole();

    expect($payment->method)->toBe(PaymentMethod::Card)
        ->and($payment->amount)->toBe('115.000')
        ->and($payment->reference)->toBe('zid_credit_card');
});

it('records nothing paid on a cash-on-delivery order not yet settled', function (): void {
    /*
     * Zid says whether the money has arrived, and Salla does not. An unpaid
     * order is still a sale — it is owed — which is what the receivables
     * figure exists to show (ADR-022).
     */
    $order = importZid([
        'order_status' => ['code' => 'indelivery'],
        'payment_status' => 'pending',
        'payment' => ['method' => ['code' => 'zid_cod']],
    ]);

    expect($order->status)->toBe(OrderStatus::Confirmed)
        ->and($order->payments()->count())->toBe(0);
});

it('records each part of a split payment', function (): void {
    $order = importZid(['payment' => ['split_payments' => [
        ['code' => 'zid_credit_card', 'amount' => '100.00'],
        ['code' => 'tabby', 'amount' => '15.00'],
    ]]]);

    $payments = $order->payments()->get()->keyBy(fn ($payment): string => $payment->method->value);

    expect($payments)->toHaveCount(2)
        ->and($payments['card']->amount)->toBe('100.000')
        ->and($payments['wallet']->amount)->toBe('15.000');
});

it('gives the customer\'s phone back its plus before placing it', function (): void {
    importZid();

    $customer = Customer::query()->where('source', 'zid')->sole();

    expect($customer->phone)->toBe('+966501806978')
        ->and($customer->name)->toBe('Sara Ahmed')
        ->and($customer->external_id)->toBe('1441');
});

it('updates the one order when the same order arrives again', function (): void {
    importZid();
    importZid(['order_status' => ['code' => 'reversed']]);

    expect(Order::query()->where('source', 'zid')->count())->toBe(1)
        ->and(Order::query()->where('source', 'zid')->sole()->status)->toBe(OrderStatus::Cancelled);
});

it('does not move stock, because the store already did', function (): void {
    $product = Product::factory()->withStock(10)->create(['sku' => 'BROW-KIT']);

    importZid();

    expect(InventoryItem::query()->where('product_id', $product->id)->value('stock_on_hand'))->toBe(10);
});

it('falls back to the order total when there is no invoice breakdown', function (): void {
    $payload = zidOrder();
    unset($payload['payment']['invoice']);

    $order = app(ImportZidOrder::class)($payload);

    expect($order->total_amount)->toBe('115.000')
        // Summed from the lines when Zid gives no subtotal of its own.
        ->and($order->subtotal_amount)->toBe('86.957');
});

it('counts an invoice line that names a discount', function (): void {
    $order = importZid(['payment' => ['invoice' => [
        ['code' => 'sub_totals_before_vat', 'value' => '86.95'],
        ['code' => 'coupon_discount', 'value' => '-10.00'],
        ['code' => 'total', 'value' => '105.00'],
    ]]]);

    expect($order->discount_amount)->toBe('10.000');
});

/*
|--------------------------------------------------------------------------
| The catalogue
|--------------------------------------------------------------------------
*/

it('imports a product\'s cost, which is what gives a Zid store its margin', function (): void {
    $products = app(ImportZidProduct::class)([
        'id' => 'b1f5', 'sku' => 'LAMP-1', 'name' => ['ar' => 'مصباح', 'en' => 'Lamp'],
        'price' => 60, 'cost' => 22.5, 'is_published' => true, 'structure' => 'standalone',
    ]);

    expect($products)->toHaveCount(1)
        ->and($products[0]->cost)->toBe('22.5000')
        ->and($products[0]->name)->toBe('Lamp')
        ->and($products[0]->source)->toBe('zid');
});

it('leaves a cost the owner typed alone when Zid has none', function (): void {
    $mine = Product::factory()->create(['sku' => 'LAMP-1', 'cost' => '18']);

    app(ImportZidProduct::class)(['id' => 'b1f5', 'sku' => 'LAMP-1', 'name' => 'Lamp', 'price' => 60, 'cost' => null]);

    expect($mine->refresh()->cost)->toBe('18.0000')
        // It gained Zid's id rather than a second copy.
        ->and($mine->external_id)->toBe('b1f5')
        ->and(Product::query()->where('sku', 'LAMP-1')->count())->toBe(1);
});

it('imports the variants of a product with options, not the parent', function (): void {
    /*
     * The variants are what an order's lines name. Importing the parent too
     * would be a product nobody can buy, splitting every figure grouped by
     * product.
     */
    $products = app(ImportZidProduct::class)([
        'id' => 'parent-1', 'sku' => 'SHIRT', 'name' => ['en' => 'Shirt'], 'price' => 80,
        'structure' => 'parent', 'is_published' => true,
        'variants' => [
            ['id' => 'v-s', 'sku' => 'SHIRT-S', 'price' => 80, 'cost' => 30],
            ['id' => 'v-m', 'sku' => 'SHIRT-M', 'name' => ['en' => 'Shirt, medium'], 'price' => 85, 'cost' => 31],
        ],
    ]);

    expect(collect($products)->pluck('sku')->all())->toBe(['SHIRT-S', 'SHIRT-M'])
        ->and($products[0]->name)->toBe('Shirt')
        ->and($products[1]->name)->toBe('Shirt, medium')
        ->and(Product::query()->where('sku', 'SHIRT')->exists())->toBeFalse();
});
