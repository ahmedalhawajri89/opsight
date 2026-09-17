<?php

declare(strict_types=1);

namespace Tests\Support;

use App\Domain\Metrics\Period;
use App\Domain\Orders\OrderStatus;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Product;
use Illuminate\Support\Carbon;

/**
 * Two complete, adjacent months with enough volume to clear the guards.
 *
 * Built by hand rather than with the demo seeder, because an insight test has
 * to control the exact shape of the change it is asserting on — "revenue fell
 * 20%" is only a meaningful assertion if the fixture fell by 20% on purpose.
 *
 * Both months are in the PAST and COMPLETE. The engine suppresses every
 * period-based rule on a partial period, so a fixture ending today would
 * silently assert nothing at all: every test would pass by suppression rather
 * than by the rule not firing, and the difference is invisible from the
 * assertion.
 */
final class InsightFixture
{
    /** The period under test, and the one it compares against. */
    public const CURRENT_FROM = '2026-07-01';

    public const CURRENT_TO = '2026-07-31';

    public const PREVIOUS_FROM = '2026-06-01';

    public const PREVIOUS_TO = '2026-06-30';

    /** Comfortably above config('insights.minimum_orders'). */
    public const ORDERS_PER_MONTH = 12;

    public static function period(): Period
    {
        return Period::between(self::CURRENT_FROM, self::CURRENT_TO);
    }

    /**
     * Orders in both months at the given per-order revenue.
     *
     * Everything is written directly rather than through ConfirmOrder, because
     * the fixture needs orders PLACED in a past month and the confirm service
     * stamps `placed_at` with now — correctly, since that is what confirming
     * means. Backdating is a property of the fixture, not of the domain.
     */
    public static function build(
        float $currentUnitPrice = 100.0,
        float $currentUnitCost = 40.0,
        float $previousUnitPrice = 100.0,
        float $previousUnitCost = 40.0,
        ?int $currentOrders = null,
        ?int $previousOrders = null,
    ): void {
        $product = Product::factory()->priced(100.0000, 40.0000)->withStock(10_000)->create();

        self::month(
            self::PREVIOUS_FROM,
            $product,
            $previousUnitPrice,
            $previousUnitCost,
            $previousOrders ?? self::ORDERS_PER_MONTH,
        );

        self::month(
            self::CURRENT_FROM,
            $product,
            $currentUnitPrice,
            $currentUnitCost,
            $currentOrders ?? self::ORDERS_PER_MONTH,
        );
    }

    private static function month(
        string $start,
        Product $product,
        float $price,
        float $cost,
        int $orders,
    ): void {
        $day = Carbon::parse($start, config('app.timezone'));

        for ($i = 0; $i < $orders; $i++) {
            $customer = Customer::factory()->create();

            $order = Order::factory()->forCustomer($customer)->create();

            $order->items()->create([
                'product_id' => $product->id,
                'product_name' => $product->name,
                'product_sku' => $product->sku,
                'unit_price' => $price,
                'unit_cost' => $cost,
                'quantity' => 1,
                'line_discount' => 0,
                'line_total' => $price,
            ]);

            $order->forceFill([
                'status' => OrderStatus::Fulfilled,
                // Spread across the month so a daily time series is not one
                // spike, and kept at midday so no order can drift over a
                // boundary when converted to UTC.
                'placed_at' => $day->clone()->addDays($i)->setTime(12, 0),
                'fulfilled_at' => $day->clone()->addDays($i)->setTime(14, 0),
                'subtotal_amount' => $price,
                'total_amount' => $price,
                'cogs_amount' => $cost,
            ])->save();
        }
    }

    /** One expense in a category, in the named month. */
    public static function expense(string $category, string $incurredOn, float $amount): void
    {
        $model = ExpenseCategory::query()->firstOrCreate(
            ['name' => $category],
            ['slug' => str($category)->slug()->value(), 'is_active' => true],
        );

        Expense::factory()->create([
            'expense_category_id' => $model->id,
            'description' => $category.' for '.$incurredOn,
            'amount' => $amount,
            'incurred_on' => $incurredOn,
        ]);
    }
}
