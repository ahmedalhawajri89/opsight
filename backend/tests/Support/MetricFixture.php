<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Domain\Inventory\AdjustStock;
use App\Domain\Inventory\StockLedger;
use App\Domain\Orders\CancelOrder;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\FulfilOrder;
use App\Domain\Orders\OrderStatus;
use App\Domain\Orders\RecordRefund;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * A small, fixed dataset whose metrics are worked out BY HAND.
 *
 * WHY THIS SHAPE. A metric test must assert against a hand-calculated literal,
 * never against a second implementation of the same formula — two
 * implementations of the same mistake agree perfectly and the suite goes green
 * on a wrong number (TESTING_STRATEGY.md §3.2).
 *
 * So the dataset is deliberately tiny and the arithmetic is written out below,
 * in full, where a human can check it.
 *
 * ---------------------------------------------------------------------------
 * PRODUCTS (price / cost at the time each order was confirmed)
 * ---------------------------------------------------------------------------
 *   WIDGET   sold at 100.0000, cost 40.0000
 *   GADGET   sold at  25.0000, cost 10.0000
 *
 * After all orders are placed, WIDGET is repriced to 150 / 60. Nothing below
 * changes, which is the point.
 *
 * ---------------------------------------------------------------------------
 * ORDERS — all placed inside the period 2026-08-01 .. 2026-08-31
 * ---------------------------------------------------------------------------
 *  #  customer   lines                     status      subtotal  cogs
 *  1  ALPHA      2 x WIDGET                fulfilled     200.00   80.00
 *  2  ALPHA      4 x GADGET                confirmed     100.00   40.00
 *  3  BETA       1 x WIDGET, 2 x GADGET    fulfilled     150.00   60.00
 *  4  GAMMA      3 x GADGET                cancelled       —        —
 *  5  (walk-in)  1 x WIDGET                fulfilled     100.00   40.00
 *  6  BETA       2 x GADGET                fulfilled      50.00   20.00
 *                                          then refunded 50.00
 *
 * Order 2 carries a 10.00 order-level discount.
 *
 * ---------------------------------------------------------------------------
 * HAND-CALCULATED EXPECTATIONS for 2026-08-01 .. 2026-08-31
 * ---------------------------------------------------------------------------
 * Qualifying orders (confirmed, fulfilled, refunded) = 1, 2, 3, 5, 6 → 5
 * Cancelled order 4 is excluded from everything except cancellation rate.
 *
 * Gross revenue   = 200 + 100 + 150 + 100 + 50            =  600.00
 * Discounts       = 10                                     =   10.00
 * Refunds         = 50 (order 6)                           =   50.00
 * NET REVENUE     = 600 - 10 - 50                          =  540.00
 *
 * ORDERS COUNT                                             =    5
 * UNITS SOLD      = 2 + 4 + (1+2) + 1 + 2                  =   12
 * AOV             = 540.00 / 5                             =  108.00
 *
 * COGS            = 80 + 40 + 60 + 40 + 20                 =  240.00
 * GROSS PROFIT    = 540 - 240                              =  300.00
 * GROSS MARGIN    = 300 / 540                              = 0.555556
 *
 * EXPENSES        = 90.00 + 60.00                          =  150.00
 * NET PROFIT      = 300 - 150                              =  150.00
 * NET MARGIN      = 150 / 540                              = 0.277778
 *
 * CANCELLATION RATE = 1 cancelled / 6 placed               = 0.166667
 * REFUND RATE       = 50 / 600                             = 0.083333
 *
 * ACTIVE CUSTOMERS  = ALPHA, BETA (walk-in excluded)       =    2
 * NEW CUSTOMERS     = ALPHA and BETA both first ordered
 *                     in this period                       =    2
 *   GAMMA ordered only order 4, which was cancelled, so
 *   GAMMA is not new — a cancelled order is not a first sale.
 * RETURNING         = 2 - 2                                =    0
 * ---------------------------------------------------------------------------
 */
final class MetricFixture
{
    public const FROM = '2026-08-01';

    public const TO = '2026-08-31';

    /**
     * Hand-calculated, transcribed from the table above.
     *
     * Money is written to THREE places because the fixture runs under the
     * product's default currency, BHD, and amounts now come back at their
     * currency's own precision. The values are the same as they always were.
     */
    public const EXPECTED = [
        'gross_revenue' => '600.000',
        'net_revenue' => '540.000',
        'orders_count' => 5,
        'units_sold' => 12,
        'average_order_value' => '108.000',
        'cogs' => '240.000',
        'gross_profit' => '300.000',
        'gross_margin' => 0.555556,
        'operating_expenses' => '150.000',
        'net_profit' => '150.000',
        'net_margin' => 0.277778,
        'cancellation_rate' => 0.166667,
        'refund_rate' => 0.083333,
        'active_customers' => 2,
        'new_customers' => 2,
        'returning_customers' => 0,
    ];

    public static function build(): void
    {
        $category = Category::create(['name' => 'Fixture', 'slug' => 'fixture-'.Str::random(4)]);

        $widget = self::product('WIDGET', 'Widget', 100.0000, 40.0000, $category->id);
        $gadget = self::product('GADGET', 'Gadget', 25.0000, 10.0000, $category->id);

        $alpha = Customer::create(['name' => 'Alpha Ltd', 'email' => 'alpha@fixture.test']);
        $beta = Customer::create(['name' => 'Beta Ltd', 'email' => 'beta@fixture.test']);
        $gamma = Customer::create(['name' => 'Gamma Ltd', 'email' => 'gamma@fixture.test']);

        // Placed mid-period so a timezone slip in either direction is visible.
        $placedAt = '2026-08-15 10:00:00';

        $one = self::order($alpha->id, [[$widget, 2]], $placedAt);
        app(FulfilOrder::class)($one);

        self::order($alpha->id, [[$gadget, 4]], $placedAt, discount: 10);

        $three = self::order($beta->id, [[$widget, 1], [$gadget, 2]], $placedAt);
        app(FulfilOrder::class)($three);

        // Cancelled: counts in the cancellation rate and nowhere else, and does
        // not make GAMMA a new customer.
        $four = self::order($gamma->id, [[$gadget, 3]], $placedAt);
        app(CancelOrder::class)($four, 'Fixture cancellation');

        // Walk-in: excluded from customer metrics, included in revenue.
        $five = self::order(null, [[$widget, 1]], $placedAt);
        app(FulfilOrder::class)($five);

        $six = self::order($beta->id, [[$gadget, 2]], $placedAt);
        app(FulfilOrder::class)($six);
        app(RecordRefund::class)($six, '50.00', returnStock: false);

        self::expense('Fixture rent', 90.00, '2026-08-05');
        self::expense('Fixture utilities', 60.00, '2026-08-20');

        // Outside the period, so every range check has something to exclude.
        self::expense('July expense', 500.00, '2026-07-15');

        /*
         * The catalog moves on AFTER every order is committed.
         *
         * Any metric that reads products.cost instead of the line snapshot now
         * produces a different number, and the assertions above catch it.
         */
        $widget->update(['price' => 150.0000, 'cost' => 60.0000]);
    }

    private static function product(string $sku, string $name, float $price, float $cost, int $categoryId): Product
    {
        $product = new Product([
            'name' => $name,
            'category_id' => $categoryId,
            'price' => $price,
            'cost' => $cost,
            'unit' => 'piece',
        ]);

        $product->sku = $sku;
        $product->save();

        app(StockLedger::class)->createItemForProduct($product);
        app(AdjustStock::class)->restock($product, 500, (string) $cost, 'Fixture stock');

        return $product;
    }

    /**
     * @param  array<int, array{0: Product, 1: int}>  $lines
     */
    private static function order(?int $customerId, array $lines, string $placedAt, float $discount = 0): Order
    {
        $order = new Order([
            'customer_id' => $customerId,
            'discount_amount' => $discount,
        ]);

        $order->reference = 'FIX-'.Str::upper(Str::random(10));
        $order->status = OrderStatus::Draft;
        $order->save();

        foreach ($lines as [$product, $quantity]) {
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

        $order = app(ConfirmOrder::class)($order);

        // Backdate to the fixture's business date. ConfirmOrder correctly stamps
        // "now"; only a fixture has any business rewriting it.
        DB::table('orders')->where('id', $order->id)->update(['placed_at' => $placedAt]);

        return $order->refresh();
    }

    private static function expense(string $description, float $amount, string $incurredOn): void
    {
        $category = ExpenseCategory::firstOrCreate(
            ['slug' => 'fixture'],
            ['name' => 'Fixture'],
        );

        Expense::create([
            'expense_category_id' => $category->id,
            'description' => $description,
            'amount' => $amount,
            'incurred_on' => $incurredOn,
        ]);
    }
}
