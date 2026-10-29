<?php

declare(strict_types=1);

use App\Domain\Compliance\EraseCustomer;
use App\Domain\Integrations\Salla\ImportSallaOrder;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\Product;

/*
|--------------------------------------------------------------------------
| One Salla order, as an Opsight order (ADR-029)
|--------------------------------------------------------------------------
|
| The payloads below are shaped from Salla's own documented order webhook
| example — money nested as {amount, currency}, the customer's mobile split
| across `mobile_code` and `mobile`, items carrying both their own amounts
| and a nested product.
|
*/

/** @param array<string, mixed> $overrides */
function sallaOrderPayload(array $overrides = []): array
{
    /*
     * Recursive merge for the nested maps, so a test can override one key of
     * `status` or `amounts` without restating the rest — but a LIST is
     * replaced outright. Merging `items` recursively left the default item's
     * sku and product underneath an override meant to remove them, so a test
     * about an unidentifiable line silently tested an identifiable one.
     */
    $lists = array_intersect_key($overrides, array_flip(['items', 'payment_methods']));

    return array_replace(array_replace_recursive([
        'id' => 2116149737,
        'reference_id' => 41027662,
        'date' => ['date' => '2026-06-26 12:21:45.000000', 'timezone' => 'Asia/Riyadh'],
        'status' => ['id' => 566146469, 'name' => 'تم التنفيذ', 'slug' => 'completed'],
        'payment_method' => 'mada',
        'payment_methods' => [
            ['amount' => 196, 'payment_method' => 'mada', 'transaction_reference' => '30543'],
        ],
        'currency' => 'SAR',
        'amounts' => [
            'sub_total' => ['amount' => 186, 'currency' => 'SAR'],
            'shipping_cost' => ['amount' => 15, 'currency' => 'SAR'],
            'tax' => ['percent' => '15.00', 'amount' => ['amount' => 0, 'currency' => 'SAR']],
            'discounts' => [['title' => 'new offer', 'discount' => '5.00']],
            'total' => ['amount' => 196, 'currency' => 'SAR'],
        ],
        'customer' => [
            'id' => 225167971,
            'first_name' => 'Mohammed',
            'last_name' => 'Ali',
            'mobile' => 501806978,
            'mobile_code' => '+966',
            'email' => 'usertest@example.test',
            'city' => 'جدة',
            'country_code' => 'SA',
        ],
        'items' => [
            [
                'id' => 70815337,
                'name' => 'بيتزا',
                'sku' => 'PIZZA-1',
                'quantity' => 2,
                'amounts' => [
                    'price_without_tax' => ['amount' => 186, 'currency' => 'SAR'],
                    'total_discount' => ['amount' => 5, 'currency' => 'SAR'],
                    'total' => ['amount' => 186, 'currency' => 'SAR'],
                ],
                'product' => ['id' => 720881993, 'sku' => 'PIZZA-1', 'name' => 'بيتزا', 'price' => ['amount' => 66, 'currency' => 'SAR']],
            ],
        ],
    ], $overrides), $lists);
}

function importOrder(array $overrides = []): Order
{
    return app(ImportSallaOrder::class)(sallaOrderPayload($overrides));
}

/*
|--------------------------------------------------------------------------
| The order itself
|--------------------------------------------------------------------------
*/

it('writes Salla\'s totals as they arrived, rather than recomputing them', function (): void {
    /*
     * The reconciler compares our figures with Salla's. If the importer
     * recalculated the totals from the lines, that comparison would be our
     * arithmetic against itself and would never find a drift.
     */
    $order = importOrder();

    expect($order->status)->toBe(OrderStatus::Fulfilled)
        ->and($order->subtotal_amount)->toBe('186.000')
        ->and($order->shipping_amount)->toBe('15.000')
        ->and($order->discount_amount)->toBe('5.000')
        ->and($order->total_amount)->toBe('196.000')
        ->and($order->source)->toBe('salla')
        ->and($order->external_id)->toBe('2116149737');
});

it('gives an imported order a reference in the same series as a typed one', function (): void {
    // A business reads one list of orders, not two.
    expect(importOrder()->reference)->toMatch('/^ORD-\d{4}-\d{6}$/');
});

it('places the order at the store\'s own moment, in the store\'s own timezone', function (): void {
    $order = importOrder();

    // 12:21:45 in Asia/Riyadh is 09:21:45 UTC.
    expect($order->placed_at->toIso8601String())->toBe('2026-06-26T09:21:45+00:00')
        ->and($order->fulfilled_at)->not->toBeNull();
});

it('records no margin it does not know', function (): void {
    /*
     * Salla's order payload carries no cost. A guessed one would produce a
     * margin figure that looks authoritative and is invented.
     */
    $order = importOrder();

    expect($order->cogs_amount)->toBe('0.000')
        ->and($order->items()->first()->unit_cost)->toBe('0.0000');
});

/*
|--------------------------------------------------------------------------
| Running it twice
|--------------------------------------------------------------------------
*/

it('updates the one order when the same delivery arrives again', function (): void {
    // Salla retries, orders change through their life, and a backfill covers
    // ground a webhook already covered.
    importOrder();
    importOrder();
    importOrder(['status' => ['slug' => 'canceled']]);

    expect(Order::query()->count())->toBe(1);

    $order = Order::query()->firstOrFail();

    expect($order->status)->toBe(OrderStatus::Cancelled)
        ->and($order->cancelled_at)->not->toBeNull()
        ->and($order->items()->count())->toBe(1);
});

it('does not pile up lines or payments on re-import', function (): void {
    importOrder();
    importOrder();

    $order = Order::query()->firstOrFail();

    expect($order->items()->count())->toBe(1)
        ->and($order->payments()->count())->toBe(1);
});

it('keeps one customer however many of their orders arrive', function (): void {
    importOrder(['id' => 1]);
    importOrder(['id' => 2]);

    expect(Customer::query()->count())->toBe(1)
        ->and(Order::query()->count())->toBe(2);
});

/*
|--------------------------------------------------------------------------
| The customer
|--------------------------------------------------------------------------
*/

it('joins the split mobile and stores it in international form', function (): void {
    // Salla sends `mobile` as an integer and the code separately.
    $customer = importOrder()->customer;

    expect($customer->name)->toBe('Mohammed Ali')
        ->and($customer->phone)->toBe('+966501806978')
        ->and($customer->country)->toBe('SA')
        ->and($customer->source)->toBe('salla');
});

it('treats a guest checkout as a walk-in', function (): void {
    $order = app(ImportSallaOrder::class)(array_diff_key(sallaOrderPayload(), ['customer' => null]));

    expect($order->customer_id)->toBeNull()
        ->and(Customer::query()->count())->toBe(0);
});

it('will not write an erased person\'s details back', function (): void {
    /*
     * An erasure means the person stops being identifiable. An import that
     * repopulated them would undo it silently, on a schedule (ADR-026).
     */
    importOrder();

    $customer = Customer::query()->firstOrFail();
    app(EraseCustomer::class)($customer, 'Subject request');

    importOrder(['id' => 999]);

    $fresh = $customer->fresh();

    expect($fresh->name)->toBe('[erased]')
        ->and($fresh->email)->toBeNull()
        ->and($fresh->phone)->toBeNull();
});

/*
|--------------------------------------------------------------------------
| Products, and the stock that must not move
|--------------------------------------------------------------------------
*/

it('does not move stock, because the store already did', function (): void {
    /*
     * The store is the system of record for its own shelves. An importer
     * that also decremented would show every imported sale leaving stock
     * twice (ADR-027).
     */
    $existing = Product::factory()->withStock(10)->create(['sku' => 'PIZZA-1']);
    $movementsBefore = $existing->movements()->count();

    importOrder();

    expect(InventoryItem::query()->where('product_id', $existing->id)->value('stock_on_hand'))->toBe(10)
        // And no movement was written claiming it did: the ledger's
        // invariant holds because nothing was said to have moved.
        ->and($existing->movements()->count())->toBe($movementsBefore);
});

it('reuses a product already entered here, matched on its SKU', function (): void {
    // A store entered by hand before it was connected has the same SKUs.
    // Making second copies would split every figure that groups by product.
    $existing = Product::factory()->create(['sku' => 'PIZZA-1', 'name' => 'Pizza, as we named it']);

    $order = importOrder();

    expect(Product::query()->count())->toBe(1)
        ->and($order->items()->first()->product_id)->toBe($existing->id)
        ->and($existing->fresh()->name)->toBe('Pizza, as we named it');
});

it('creates a product it has never seen, with no cost claimed', function (): void {
    $order = importOrder();

    $product = Product::query()->firstOrFail();

    expect($product->sku)->toBe('PIZZA-1')
        ->and($product->source)->toBe('salla')
        ->and($product->external_id)->toBe('720881993')
        ->and($product->cost)->toBe('0.0000')
        ->and($order->items()->first()->product_id)->toBe($product->id);
});

it('still imports a line whose product cannot be identified', function (): void {
    $order = importOrder(['items' => [['name' => 'Something', 'quantity' => 1, 'amounts' => ['total' => ['amount' => 10]]]]]);

    $item = $order->items()->firstOrFail();

    expect($item->product_id)->toBeNull()
        ->and($item->product_name)->toBe('Something')
        ->and($item->line_total)->toBe('10.000');
});

it('divides a line total by its quantity to get a unit price', function (): void {
    $item = importOrder()->items()->firstOrFail();

    // 186 over two.
    expect($item->quantity)->toBe(2)
        ->and($item->unit_price)->toBe('93.0000')
        ->and($item->line_total)->toBe('186.000')
        ->and($item->line_discount)->toBe('5.000');
});

/*
|--------------------------------------------------------------------------
| Payment
|--------------------------------------------------------------------------
*/

it('records each way the order was paid', function (): void {
    $order = importOrder(['payment_methods' => [
        ['amount' => 146, 'payment_method' => 'bank'],
        ['amount' => 50, 'payment_method' => 'customer_wallet'],
    ]]);

    // Keyed by method rather than read by index: what matters is that each
    // way of paying arrived with its own amount, not what order they came
    // back in.
    $payments = $order->payments()->get()->keyBy(fn ($payment): string => $payment->method->value);

    expect($payments)->toHaveCount(2)
        ->and($payments['wallet']->amount)->toBe('50.000')
        ->and($payments['bank_transfer']->amount)->toBe('146.000');
});

it('keeps Salla\'s own word for a method it had to file as other', function (): void {
    $order = importOrder(['payment_methods' => [['amount' => 196, 'payment_method' => 'some_new_wallet']]]);

    $payment = $order->payments()->firstOrFail();

    expect($payment->method)->toBe(PaymentMethod::Other)
        ->and($payment->reference)->toBe('some_new_wallet');
});

it('records nothing against an order that was never committed', function (): void {
    // An unpaid basket owes nothing, because it is not a sale yet.
    $order = importOrder(['status' => ['slug' => 'payment_pending']]);

    expect($order->status)->toBe(OrderStatus::Draft)
        ->and($order->placed_at)->toBeNull()
        ->and($order->payments()->count())->toBe(0);
});

/*
|--------------------------------------------------------------------------
| The figures it produces
|--------------------------------------------------------------------------
*/

it('counts toward revenue exactly once, and not at all while it is a draft', function (): void {
    $draft = importOrder(['id' => 1, 'status' => ['slug' => 'payment_pending']]);
    $sold = importOrder(['id' => 2]);

    $qualifying = Order::query()->whereIn('status', OrderStatus::qualifying())->get();

    expect($qualifying)->toHaveCount(1)
        ->and($qualifying->first()->id)->toBe($sold->id)
        ->and($draft->status)->toBe(OrderStatus::Draft);
});

it('refuses an order whose status it does not know, rather than filing it wrongly', function (): void {
    expect(fn () => importOrder(['status' => ['slug' => 'ready_for_pickup']]))
        ->toThrow(RuntimeException::class, 'ready_for_pickup');

    expect(Order::query()->count())->toBe(0);
});
