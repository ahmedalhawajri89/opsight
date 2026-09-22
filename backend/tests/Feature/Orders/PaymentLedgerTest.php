<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\FulfilOrder;
use App\Domain\Orders\OrderStatus;
use App\Domain\Orders\OrderTransitionException;
use App\Domain\Orders\RecordRefund;
use App\Domain\Payments\PaymentMethod;
use App\Domain\Payments\PaymentStatus;
use App\Domain\Payments\RecordPayment;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Validation\ValidationException;

/*
|--------------------------------------------------------------------------
| Payments and the refund ledger (ADR-022)
|--------------------------------------------------------------------------
|
| Payment status is derived, never stored; each running total on the order
| equals the sum of its ledger; stock comes back once per order however many
| refunds follow.
|
*/

function ledgerOrder(int $quantity = 2, bool $fulfil = true): Order
{
    // 50.000 each: a total of 100.000 for two, with no tax or shipping.
    $product = Product::factory()->priced(50.0000, 20.0000)->withStock(10)->create();
    $order = Order::factory()->create();

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

    $order = app(ConfirmOrder::class)($order);

    return $fulfil ? app(FulfilOrder::class)($order) : $order;
}

function stockOf(Order $order): int
{
    return (int) InventoryItem::where('product_id', $order->items()->value('product_id'))->value('stock_on_hand');
}

/*
|--------------------------------------------------------------------------
| Payment status
|--------------------------------------------------------------------------
*/

it('moves from unpaid to partially paid to settled', function (): void {
    $order = ledgerOrder(fulfil: false);
    $pay = app(RecordPayment::class);

    expect(PaymentStatus::for($order))->toBe(PaymentStatus::Unpaid)
        ->and(PaymentStatus::outstanding($order))->toBe('100.000');

    $order = $pay($order, '40', PaymentMethod::Card);

    expect(PaymentStatus::for($order))->toBe(PaymentStatus::PartiallyPaid)
        ->and(PaymentStatus::outstanding($order))->toBe('60.000');

    $order = $pay($order, '60', PaymentMethod::CashOnDelivery);

    expect(PaymentStatus::for($order))->toBe(PaymentStatus::Settled)
        ->and(PaymentStatus::outstanding($order))->toBe('0.000')
        ->and($order->payments()->count())->toBe(2);
});

it('gives a draft or cancelled order no payment status', function (): void {
    expect(PaymentStatus::for(Order::factory()->create()))->toBeNull();
});

it('refuses a payment above what is outstanding', function (): void {
    $order = ledgerOrder();

    expect(fn () => app(RecordPayment::class)($order, '100.001', PaymentMethod::Cash))
        ->toThrow(ValidationException::class);

    expect($order->fresh()->payments()->count())->toBe(0)
        ->and($order->fresh()->amount_paid)->toBe('0.000');
});

it('refuses a payment of zero', function (): void {
    expect(fn () => app(RecordPayment::class)(ledgerOrder(), '0', PaymentMethod::Cash))
        ->toThrow(ValidationException::class);
});

it('refuses a payment against a draft', function (): void {
    expect(fn () => app(RecordPayment::class)(Order::factory()->create(), '10', PaymentMethod::Cash))
        ->toThrow(ValidationException::class);
});

it('counts a refund against what an unpaid order owes', function (): void {
    // Goods returned before the customer paid: there is less to collect.
    $order = app(RecordRefund::class)(ledgerOrder(), '30', returnStock: false);

    expect(PaymentStatus::outstanding($order))->toBe('70.000')
        ->and(PaymentStatus::for($order))->toBe(PaymentStatus::Unpaid);
});

it('keeps amount_paid equal to the sum of the payment ledger', function (): void {
    $order = ledgerOrder();
    $pay = app(RecordPayment::class);

    $pay($order, '12.345', PaymentMethod::Card);
    $pay($order, '0.005', PaymentMethod::Wallet);
    $order = $pay($order, '50', PaymentMethod::Cash);

    expect($order->amount_paid)->toBe('62.350')
        ->and(bcadd((string) $order->payments()->sum('amount'), '0', 3))->toBe('62.350');
});

/*
|--------------------------------------------------------------------------
| The refund ledger
|--------------------------------------------------------------------------
*/

it('takes more than one refund, in parts, up to the total', function (): void {
    $order = ledgerOrder();
    $refund = app(RecordRefund::class);

    $order = $refund($order, '30', reason: 'Damaged box');
    $order = $refund($order, '50', returnStock: false);

    expect($order->status)->toBe(OrderStatus::Refunded)
        ->and($order->refunded_amount)->toBe('80.000')
        ->and($order->refunds()->count())->toBe(2)
        ->and($order->refunds()->first()->reason)->toBe('Damaged box');

    // 20 left; 20.001 is too much, 20 is exactly right.
    expect(fn () => $refund($order, '20.001', returnStock: false))
        ->toThrow(OrderTransitionException::class);

    expect($refund($order, '20', returnStock: false)->refunded_amount)->toBe('100.000');
});

it('keeps the refunded totals equal to the sum of the refund ledger', function (): void {
    $order = ledgerOrder();
    $refund = app(RecordRefund::class);

    $refund($order, '10.005');
    $order = $refund($order->refresh(), '33.3', returnStock: false);

    $ledger = bcadd((string) $order->refunds()->sum('total'), '0', 3);

    expect(bcadd($order->refunded_amount, $order->refunded_vat_amount, 3))->toBe($ledger)
        ->and($ledger)->toBe('43.305');
});

it('returns stock once per order however many refunds follow', function (): void {
    $order = ledgerOrder(quantity: 3);
    $before = stockOf($order);

    $order = app(RecordRefund::class)($order, '20');

    expect(stockOf($order))->toBe($before + 3)
        ->and($order->stock_returned_at)->not->toBeNull();

    // A second refund asking for stock back would shelve the goods twice.
    expect(fn () => app(RecordRefund::class)($order, '20', returnStock: true))
        ->toThrow(OrderTransitionException::class);

    expect(stockOf($order))->toBe($before + 3);
});

/*
|--------------------------------------------------------------------------
| The API
|--------------------------------------------------------------------------
*/

it('records a payment through the API and reports the derived status', function (): void {
    $order = ledgerOrder();
    $this->actingAs(User::factory()->role(Role::Staff)->create());

    $this->postJson("/api/v1/orders/{$order->id}/payments", [
        'amount' => '25',
        'method' => 'cash_on_delivery',
        'reference' => 'DRV-17',
    ])
        ->assertOk()
        ->assertJsonPath('data.amount_paid', '25.000')
        ->assertJsonPath('data.outstanding_amount', '75.000')
        ->assertJsonPath('data.payment_status', 'partially_paid')
        ->assertJsonPath('data.payments.0.method', 'cash_on_delivery')
        ->assertJsonPath('data.payments.0.reference', 'DRV-17');
});

it('rejects an unknown payment method', function (): void {
    $this->actingAs(User::factory()->role(Role::Owner)->create());

    $this->postJson('/api/v1/orders/'.ledgerOrder()->id.'/payments', ['amount' => '10', 'method' => 'barter'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('method');
});

it('forbids an analyst from recording a payment', function (): void {
    $this->actingAs(User::factory()->role(Role::Analyst)->create());

    $this->postJson('/api/v1/orders/'.ledgerOrder()->id.'/payments', ['amount' => '10', 'method' => 'cash'])
        ->assertForbidden();
});

it('offers record_payment only while something is owed', function (): void {
    $order = ledgerOrder();
    $this->actingAs(User::factory()->role(Role::Staff)->create());

    expect($this->getJson("/api/v1/orders/{$order->id}")->json('data.available_actions'))
        ->toContain('record_payment');

    app(RecordPayment::class)($order, '100', PaymentMethod::Card);

    expect($this->getJson("/api/v1/orders/{$order->id}")->json('data.available_actions'))
        ->not->toContain('record_payment');
});

it('offers a further refund while money is left to return', function (): void {
    $order = app(RecordRefund::class)(ledgerOrder(), '40');
    $this->actingAs(User::factory()->role(Role::Manager)->create());

    $this->getJson("/api/v1/orders/{$order->id}")
        ->assertJsonPath('data.refundable_amount', '60.000')
        ->assertJsonPath('data.stock_returned', true);

    expect($this->getJson("/api/v1/orders/{$order->id}")->json('data.available_actions'))->toContain('refund');

    // Stock is not asked for again: the endpoint defaults it off once returned.
    $this->postJson("/api/v1/orders/{$order->id}/refund", ['amount' => '60', 'reason' => 'Rest of it'])
        ->assertOk()
        ->assertJsonPath('data.refundable_amount', '0.000')
        ->assertJsonCount(2, 'data.refunds');

    expect($this->getJson("/api/v1/orders/{$order->id}")->json('data.available_actions'))->not->toContain('refund');
});

it('filters the order list by payment status', function (): void {
    $unpaid = ledgerOrder();
    $settled = app(RecordPayment::class)(ledgerOrder(), '100', PaymentMethod::Card);
    $partial = app(RecordPayment::class)(ledgerOrder(), '1', PaymentMethod::Cash);
    Order::factory()->create(); // a draft owes nothing and matches no status

    $this->actingAs(User::factory()->role(Role::Owner)->create());

    $ids = fn (string $status) => collect($this->getJson("/api/v1/orders?filter[payment_status]={$status}")->json('data'))->pluck('id')->all();

    expect($ids('unpaid'))->toBe([$unpaid->id])
        ->and($ids('settled'))->toBe([$settled->id])
        ->and($ids('partially_paid'))->toBe([$partial->id]);
});

it('shows receivables only to a role with analytics', function (): void {
    app(RecordPayment::class)(ledgerOrder(), '30', PaymentMethod::Card);
    ledgerOrder(fulfil: false);

    $this->actingAs(User::factory()->role(Role::Owner)->create());
    $stats = $this->getJson('/api/v1/dashboard')->assertOk()->json('data.quick_stats');

    expect($stats['receivables']['value'])->toBe('170.000');

    $this->actingAs(User::factory()->role(Role::Staff)->create());

    expect($this->getJson('/api/v1/dashboard')->assertOk()->json('data.quick_stats'))->toBeArray()->not->toHaveKey('receivables');
});
