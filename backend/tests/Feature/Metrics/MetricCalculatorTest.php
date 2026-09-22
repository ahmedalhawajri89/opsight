<?php

declare(strict_types=1);

use App\Domain\Metrics\Breakdown;
use App\Domain\Metrics\MetricCalculator;
use App\Domain\Metrics\Period;
use App\Domain\Metrics\TimeSeries;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\OrderStatus;
use App\Models\BusinessSetting;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Support\Money;
use Illuminate\Support\Carbon;
use Tests\Support\MetricFixture;

/*
|--------------------------------------------------------------------------
| The metric suite
|--------------------------------------------------------------------------
|
| Every assertion here compares against a literal worked out BY HAND in
| tests/Support/MetricFixture.php, never against a second implementation of the
| same formula. Two implementations of the same mistake agree perfectly.
|
| This is the suite that makes a wrong number impossible to ship quietly, which
| is the whole reason the product exists.
|
*/

beforeEach(function (): void {
    MetricFixture::build();

    $this->metrics = app(MetricCalculator::class);
    $this->period = Period::between(MetricFixture::FROM, MetricFixture::TO);
});

it('computes every headline figure to its hand-calculated value', function (): void {
    $expected = MetricFixture::EXPECTED;

    expect($this->metrics->grossRevenue($this->period))->toBe($expected['gross_revenue'])
        ->and($this->metrics->netRevenue($this->period))->toBe($expected['net_revenue'])
        ->and($this->metrics->ordersCount($this->period))->toBe($expected['orders_count'])
        ->and($this->metrics->unitsSold($this->period))->toBe($expected['units_sold'])
        ->and($this->metrics->averageOrderValue($this->period))->toBe($expected['average_order_value'])
        ->and($this->metrics->cogs($this->period))->toBe($expected['cogs'])
        ->and($this->metrics->grossProfit($this->period))->toBe($expected['gross_profit'])
        ->and($this->metrics->operatingExpenses($this->period))->toBe($expected['operating_expenses'])
        ->and($this->metrics->netProfit($this->period))->toBe($expected['net_profit']);
});

it('computes every ratio to its hand-calculated value', function (): void {
    $expected = MetricFixture::EXPECTED;

    expect(round($this->metrics->grossMargin($this->period), 6))->toBe($expected['gross_margin'])
        ->and(round($this->metrics->netMargin($this->period), 6))->toBe($expected['net_margin'])
        ->and(round($this->metrics->cancellationRate($this->period), 6))->toBe($expected['cancellation_rate'])
        ->and(round($this->metrics->refundRate($this->period), 6))->toBe($expected['refund_rate']);
});

it('computes every customer figure to its hand-calculated value', function (): void {
    $expected = MetricFixture::EXPECTED;

    expect($this->metrics->activeCustomers($this->period))->toBe($expected['active_customers'])
        ->and($this->metrics->newCustomers($this->period))->toBe($expected['new_customers'])
        ->and($this->metrics->returningCustomers($this->period))->toBe($expected['returning_customers']);
});

/*
|--------------------------------------------------------------------------
| Snapshot integrity — the rule the whole product rests on
|--------------------------------------------------------------------------
*/

it('does not move a past figure when the catalog price and cost change', function (): void {
    // The fixture already reprices WIDGET from 100/40 to 150/60 AFTER every
    // order is committed. If any metric read products.cost, these numbers would
    // differ — and by a lot.
    expect($this->metrics->cogs($this->period))->toBe('240.000')
        ->and($this->metrics->netRevenue($this->period))->toBe('540.000');

    // And again after a second change, to be certain nothing is cached.
    Product::where('sku', 'GADGET')->update(['price' => 99, 'cost' => 88]);

    expect($this->metrics->cogs($this->period))->toBe('240.000')
        ->and(round($this->metrics->grossMargin($this->period), 6))->toBe(
            round(300 / 540, 6),
            'Margin moved when the catalog changed — COGS is reading products.cost, not the snapshot.',
        );
});

it('agrees with the line-level sum, so the frozen total cannot drift', function (): void {
    [$from, $to] = $this->period->utcBounds();

    $fromLines = DB::table('order_items')
        ->join('orders', 'orders.id', '=', 'order_items.order_id')
        ->whereIn('orders.status', OrderStatus::qualifying())
        ->where('orders.placed_at', '>=', $from)
        ->where('orders.placed_at', '<', $to)
        ->selectRaw('SUM(ROUND(order_items.unit_cost * order_items.quantity, '.Money::scale().')) AS total')
        ->value('total');

    // Two routes to the same number: the frozen orders.cogs_amount and the raw
    // line snapshots. They must agree (DATABASE_DESIGN.md §3.6).
    expect((float) $this->metrics->cogs($this->period))->toBe((float) $fromLines);
});

/*
|--------------------------------------------------------------------------
| Empty periods — null is not zero
|--------------------------------------------------------------------------
*/

it('returns zero revenue but a null average for a period with no orders', function (): void {
    $empty = Period::between('2020-01-01', '2020-01-31');

    // Zero revenue is a fact.
    expect($empty->from)->toBe('2020-01-01')
        ->and(app(MetricCalculator::class)->grossRevenue($empty))->toBe('0.000')
        ->and(app(MetricCalculator::class)->ordersCount($empty))->toBe(0);

    // "The average order was worth nothing" is not.
    expect(app(MetricCalculator::class)->averageOrderValue($empty))->toBeNull();
});

it('returns null for every ratio whose denominator is zero', function (): void {
    $empty = Period::between('2020-01-01', '2020-01-31');
    $metrics = app(MetricCalculator::class);

    expect($metrics->grossMargin($empty))->toBeNull()
        ->and($metrics->netMargin($empty))->toBeNull()
        ->and($metrics->cancellationRate($empty))->toBeNull()
        ->and($metrics->refundRate($empty))->toBeNull()
        ->and($metrics->repeatPurchaseRate($empty))->toBeNull();
});

/*
|--------------------------------------------------------------------------
| The cancellation rate's different denominator
|--------------------------------------------------------------------------
*/

it('includes cancelled orders in the cancellation denominator and excludes drafts', function (): void {
    // Six orders were PLACED; one was cancelled. 1/6, not 1/5.
    expect(round($this->metrics->cancellationRate($this->period), 6))->toBe(0.166667);

    // A draft has no placed_at, so it cannot enter either side of the rate.
    Order::factory()->create();

    expect(round($this->metrics->cancellationRate($this->period), 6))->toBe(0.166667);
});

it('excludes cancelled orders from revenue entirely', function (): void {
    // Order 4 was 3 x GADGET = 75.00. If cancellations leaked into revenue,
    // gross would be 675.00.
    expect($this->metrics->grossRevenue($this->period))->toBe('600.000');
});

it('excludes drafts from every metric', function (): void {
    $before = $this->metrics->netRevenue($this->period);

    $product = Product::where('sku', 'WIDGET')->first();
    $draft = Order::factory()->create();
    $draft->items()->create([
        'product_id' => $product->id,
        'product_name' => $product->name,
        'product_sku' => $product->sku,
        'unit_price' => 1000,
        'unit_cost' => 500,
        'quantity' => 50,
        'line_discount' => 0,
        'line_total' => 0,
    ]);

    // A draft is a working document, not a commitment.
    expect($this->metrics->netRevenue($this->period))->toBe($before);
});

/*
|--------------------------------------------------------------------------
| New customers — the MIN() must span all history
|--------------------------------------------------------------------------
*/

it('does not count a pre-existing customer as new', function (): void {
    // Alpha's first order is inside the period, so Alpha is new there.
    expect($this->metrics->newCustomers($this->period))->toBe(2);

    // A LATER period in which Alpha orders again must not count Alpha as new.
    $september = Period::between('2026-09-01', '2026-09-30');

    $alpha = Customer::where('email', 'alpha@fixture.test')->first();
    $product = Product::where('sku', 'GADGET')->first();

    $order = Order::factory()->forCustomer($alpha)->create();
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
    DB::table('orders')->where('id', $order->id)->update(['placed_at' => '2026-09-15 10:00:00']);

    expect($this->metrics->newCustomers($september))->toBe(
        0,
        'A customer who ordered before the period was counted as new — the MIN() is being restricted to the period.',
    );
    expect($this->metrics->returningCustomers($september))->toBe(1);
});

it('excludes walk-in orders from customer metrics but not from revenue', function (): void {
    // Order 5 is a walk-in worth 100.00, and it has no customer to attribute.
    expect($this->metrics->activeCustomers($this->period))->toBe(2)
        ->and($this->metrics->grossRevenue($this->period))->toBe('600.000');
});

it('does not make a cancelled order a first sale', function (): void {
    // GAMMA's only order was cancelled, so GAMMA never became a customer.
    expect($this->metrics->newCustomers($this->period))->toBe(2);
});

/*
|--------------------------------------------------------------------------
| Timezone boundaries
|--------------------------------------------------------------------------
*/

it('includes an order at 23:30 local on the last day and excludes 00:30 the next', function (): void {
    $timezone = BusinessSetting::current()->timezone;
    $product = Product::where('sku', 'GADGET')->first();

    $makeOrderAt = function (string $localTime) use ($product): void {
        $order = Order::factory()->walkIn()->create();
        $order->items()->create([
            'product_id' => $product->id,
            'product_name' => $product->name,
            'product_sku' => $product->sku,
            'unit_price' => 25,
            'unit_cost' => 10,
            'quantity' => 1,
            'line_discount' => 0,
            'line_total' => 0,
        ]);
        app(ConfirmOrder::class)($order);

        DB::table('orders')->where('id', $order->id)->update([
            'placed_at' => Carbon::parse($localTime, BusinessSetting::current()->timezone)->utc(),
        ]);
    };

    $baseline = $this->metrics->ordersCount($this->period);

    // The last moment inside the period, in BUSINESS time.
    $makeOrderAt('2026-08-31 23:30:00');

    // The calculator memoises a period aggregate for the request, so a test
    // that writes and then re-reads must ask for a fresh snapshot.
    $this->metrics->flush();

    expect($this->metrics->ordersCount($this->period))->toBe(
        $baseline + 1,
        'An order at 23:30 on the final day was dropped — the range is not half-open, or the boundary was resolved in UTC.',
    );

    // The first moment outside it.
    $makeOrderAt('2026-09-01 00:30:00');
    $this->metrics->flush();

    expect($this->metrics->ordersCount($this->period))->toBe(
        $baseline + 1,
        'An order after the period was included — the boundary leaked into the next day.',
    );

    expect($timezone)->not->toBe('UTC', 'This test is only meaningful in a non-UTC business timezone.');
});

/*
|--------------------------------------------------------------------------
| Expenses use the business date, not the entry date
|--------------------------------------------------------------------------
*/

it('ranges expenses on incurred_on and excludes those outside the period', function (): void {
    // The fixture includes a 500.00 July expense that must not appear.
    expect($this->metrics->operatingExpenses($this->period))->toBe('150.000');

    $july = Period::between('2026-07-01', '2026-07-31');
    expect($this->metrics->operatingExpenses($july))->toBe('500.000');
});

it('lets a backdated expense change a closed period, which is correct', function (): void {
    Expense::create([
        'expense_category_id' => ExpenseCategory::first()->id,
        'description' => 'Invoice that arrived late',
        'amount' => 25.00,
        'incurred_on' => '2026-08-10',
    ]);

    // An invoice dated last month IS last month's expense, whenever it was
    // entered. The figure moving is the system being right, not wrong.
    expect($this->metrics->operatingExpenses($this->period))->toBe('175.000');
});

/*
|--------------------------------------------------------------------------
| The L2 guard: composed views must agree with the L1 definition
|--------------------------------------------------------------------------
|
| TimeSeries and Breakdown write their own SQL rather than calling
| MetricCalculator, because a per-bucket or per-group aggregation cannot be N
| calls to a period-scoped metric without N queries.
|
| That is only safe while their totals still match the single definition. These
| two tests are that guard. If either drifts, the system has two definitions of
| revenue — the exact failure METRICS.md exists to prevent.
|
*/

it('sums its time series buckets to the period total', function (): void {
    $series = app(TimeSeries::class)->build(
        $this->period,
        'net_revenue',
        'day',
        User::factory()->owner()->create(),
    );

    $summed = array_reduce(
        $series,
        fn (string $carry, array $bucket): string => bcadd($carry, (string) $bucket['value'], Money::scale()),
        '0.00',
    );

    expect($summed)->toBe(
        $this->metrics->netRevenue($this->period),
        'The time series and the period metric disagree — there are now two definitions of net revenue.',
    );
});

it('sums its breakdown rows to the period total', function (): void {
    $result = app(Breakdown::class)->build(
        $this->period,
        'product',
        'net_revenue',
        User::factory()->owner()->create(),
        limit: 50,
    );

    $summed = array_reduce(
        $result['rows'],
        fn (string $carry, array $row): string => bcadd($carry, (string) $row['value'], Money::scale()),
        '0.00',
    );

    expect($summed)->toBe($result['total']);

    /*
     * The breakdown is line-level, so it carries LINE discounts but not the
     * ORDER-level discount, and not refunds. Reconciling the two explicitly
     * documents the difference rather than leaving a reader to wonder why 600
     * is not 540.
     */
    $orderLevelAdjustments = bcadd('10.00', '50.00', Money::scale());   // discount + refund

    expect(bcsub($summed, $orderLevelAdjustments, Money::scale()))->toBe(
        $this->metrics->netRevenue($this->period),
        'The product breakdown no longer reconciles to net revenue once order-level discounts and refunds are removed.',
    );
});
