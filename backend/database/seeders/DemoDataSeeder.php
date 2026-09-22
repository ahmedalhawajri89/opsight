<?php

declare(strict_types=1);

namespace Database\Seeders;

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
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Throwable;

/**
 * Realistic demo data.
 *
 * Deliberately NOT a uniform sprinkle. Seeded data that is evenly distributed
 * hides exactly the bugs a BI system needs to catch: a metric that silently
 * ignores seasonality, a comparison that looks right because every period is
 * identical, a margin that never moves because cost never changed.
 *
 * So this seeder produces:
 *
 *   - weekday/weekend and seasonal variation in order volume,
 *   - every order status, including cancellations and refunds,
 *   - products whose price AND cost changed mid-history — the dataset that
 *     proves snapshot correctness,
 *   - customers with one order, with many, and with none,
 *   - expenses across all categories, including backdated entries,
 *   - walk-in orders with no customer, which new-customer metrics must exclude.
 *
 * Every order goes through the real ConfirmOrder service, so the inventory
 * ledger invariant holds across the whole dataset rather than being asserted
 * only in tests.
 */
class DemoDataSeeder extends Seeder
{
    /** Keep the demo reproducible: the same seed gives the same figures. */
    private const RANDOM_SEED = 20260916;

    private const MONTHS_OF_HISTORY = 36;

    public function run(): void
    {
        mt_srand(self::RANDOM_SEED);
        fake()->seed(self::RANDOM_SEED);

        $this->command->info('Seeding categories and products...');
        $categories = $this->seedCategories();
        $products = $this->seedProducts($categories);

        $this->command->info('Seeding customers...');
        $customers = $this->seedCustomers();

        $this->command->info('Seeding expense categories...');
        $expenseCategories = $this->seedExpenseCategories();

        $this->command->info('Seeding '.self::MONTHS_OF_HISTORY.' months of orders...');
        $this->seedOrderHistory($products, $customers);

        $this->command->info('Seeding expenses...');
        $this->seedExpenses($expenseCategories);

        $this->command->info('Done.');
    }

    /** @return Collection<int, Category> */
    private function seedCategories()
    {
        return collect([
            'Electronics', 'Office Supplies', 'Furniture', 'Consumables', 'Accessories',
            // firstOrCreate so a partially-failed run can be repeated without
            // first dropping the database by hand.
        ])->map(fn (string $name): Category => Category::firstOrCreate(
            ['slug' => Str::slug($name)],
            ['name' => $name],
        ));
    }

    /**
     * @param  Collection<int, Category>  $categories
     * @return Collection<int, Product>
     */
    private function seedProducts(Collection $categories): Collection
    {
        $adjust = app(AdjustStock::class);
        $owner = User::where('role', 'owner')->first();

        $products = collect();

        foreach (range(1, 40) as $index) {
            $cost = round(mt_rand(500, 40000) / 100, 4);

            // Built then saved, not ::create(): sku is immutable and therefore
            // not fillable, so it is assigned once here.
            $product = new Product([
                'name' => ucfirst(fake()->words(2, true)),
                'category_id' => $categories->random()->id,
                'price' => round($cost * (mt_rand(130, 240) / 100), 4),
                'cost' => $cost,
                'unit' => 'piece',
                'low_stock_threshold' => mt_rand(5, 20),
            ]);

            $product->sku = 'SKU-'.str_pad((string) $index, 4, '0', STR_PAD_LEFT);
            $product->created_by = $owner?->id;
            $product->save();

            app(StockLedger::class)
                ->createItemForProduct($product, (int) $product->low_stock_threshold);

            // Opening stock through the ledger, so the invariant holds from the
            // product's first moment.
            $adjust->restock($product, mt_rand(60, 400), (string) $cost, 'Opening stock', $owner?->id);

            $products->push($product);
        }

        return $products;
    }

    /** @return Collection<int, Customer> */
    private function seedCustomers()
    {
        $customers = collect();

        foreach (range(1, 60) as $ignored) {
            $customers->push(Customer::create([
                'name' => fake()->company(),
                'email' => fake()->unique()->companyEmail(),
                'phone' => fake()->phoneNumber(),
                'city' => fake()->city(),
                'country' => 'BH',
            ]));
        }

        // Customers with NO orders at all — they must not distort averages, and
        // a metric that divides by "all customers" will be caught by them.
        foreach (range(1, 8) as $ignored) {
            Customer::create([
                'name' => fake()->company(),
                'email' => fake()->unique()->companyEmail(),
                'country' => 'BH',
            ]);
        }

        return $customers;
    }

    /** @return Collection<int, ExpenseCategory> */
    private function seedExpenseCategories()
    {
        return collect([
            'Rent', 'Payroll', 'Utilities', 'Marketing',
            'Logistics', 'Software', 'Maintenance', 'Other',
        ])->map(fn (string $name): ExpenseCategory => ExpenseCategory::firstOrCreate(
            ['slug' => Str::slug($name)],
            ['name' => $name],
        ));
    }

    /**
     * @param  Collection<int, Product>  $products
     * @param  Collection<int, Customer>  $customers
     */
    private function seedOrderHistory(Collection $products, Collection $customers): void
    {
        $confirm = app(ConfirmOrder::class);
        $fulfil = app(FulfilOrder::class);
        $cancel = app(CancelOrder::class);
        $refund = app(RecordRefund::class);
        $adjust = app(AdjustStock::class);

        $staff = User::whereIn('role', ['staff', 'manager'])->get();
        $start = Carbon::now()->subMonths(self::MONTHS_OF_HISTORY)->startOfMonth();
        $sequence = 0;

        for ($month = 0; $month < self::MONTHS_OF_HISTORY; $month++) {
            $monthStart = $start->copy()->addMonths($month);

            /*
             * Price and cost drift, applied roughly twice a year.
             *
             * This is the whole point of the dataset: it means a historical
             * margin computed from snapshots differs from one computed off the
             * current catalog, so a regression in snapshotting shows up as a
             * wrong number rather than passing unnoticed.
             */
            if ($month > 0 && $month % 6 === 0) {
                foreach ($products->random(12) as $product) {
                    $product->update([
                        'cost' => round((float) $product->cost * (mt_rand(102, 118) / 100), 4),
                        'price' => round((float) $product->price * (mt_rand(103, 122) / 100), 4),
                    ]);
                }
            }

            // Seasonality: a build toward the end of the year, and a quiet
            // summer. A flat volume would make every comparison look identical.
            $seasonal = match ((int) $monthStart->month) {
                11, 12 => 1.45,
                1, 2 => 0.75,
                6, 7 => 0.85,
                default => 1.0,
            };

            $ordersThisMonth = (int) round(mt_rand(55, 85) * $seasonal);

            // Periodic restocks, so stock does not simply drain to zero.
            if ($month % 2 === 0) {
                foreach ($products->random(15) as $product) {
                    $adjust->restock(
                        $product,
                        mt_rand(40, 160),
                        (string) $product->cost,
                        'Scheduled restock',
                    );
                }
            }

            for ($i = 0; $i < $ordersThisMonth; $i++) {
                $placedAt = $this->businessDayIn($monthStart);

                // Roughly one order in eight is walk-in trade with no customer
                // record, which new-customer metrics must exclude.
                $customer = mt_rand(1, 8) === 1 ? null : $customers->random();

                $sequence++;
                $order = new Order([
                    'customer_id' => $customer?->id,
                    'discount_amount' => mt_rand(1, 6) === 1 ? mt_rand(5, 50) : 0,
                    'tax_amount' => 0,
                    'shipping_amount' => mt_rand(1, 3) === 1 ? mt_rand(2, 15) : 0,
                ]);
                $order->reference = 'ORD-'.$monthStart->year.'-'.str_pad((string) $sequence, 6, '0', STR_PAD_LEFT);
                $order->status = OrderStatus::Draft;
                $order->created_by = $staff->isNotEmpty() ? $staff->random()->id : null;
                $order->save();

                foreach ($products->random(mt_rand(1, 4)) as $product) {
                    $order->items()->create([
                        'product_id' => $product->id,
                        'product_name' => $product->name,
                        'product_sku' => $product->sku,
                        'unit_price' => $product->price,
                        'unit_cost' => $product->cost,
                        'quantity' => mt_rand(1, 6),
                        'line_discount' => 0,
                        'line_total' => 0,
                    ]);
                }

                try {
                    $confirm($order);
                } catch (Throwable) {
                    // Out of stock for that product this month. Skip it rather
                    // than restocking to force it through — occasional gaps are
                    // realistic, and silently topping up would hide a genuine
                    // stock bug behind convenient data.
                    $order->items()->delete();
                    $order->delete();

                    continue;
                }

                // Backdate to the business date. Done directly because
                // ConfirmOrder correctly stamps "now" — only a seeder has any
                // business rewriting it.
                DB::table('orders')->where('id', $order->id)->update(['placed_at' => $placedAt]);
                $order->refresh();

                $roll = mt_rand(1, 100);

                if ($roll <= 6) {
                    $cancel($order, 'Customer cancelled');

                    continue;
                }

                if ($roll <= 90) {
                    $fulfil($order);

                    // A small share of fulfilled orders are refunded.
                    if (mt_rand(1, 100) <= 4) {
                        $refund($order, (string) $order->total_amount);
                    }
                }
                // The remainder stay confirmed but not yet fulfilled.
            }
        }
    }

    /** A weekday-weighted instant within the month, at a plausible hour. */
    private function businessDayIn(Carbon $monthStart): Carbon
    {
        $day = $monthStart->copy()->addDays(mt_rand(0, $monthStart->daysInMonth - 1));

        // Weekends are quieter, so shift most weekend orders onto a weekday.
        if ($day->isWeekend() && mt_rand(1, 100) <= 70) {
            $day->addDays(2);
        }

        return $day->setTime(mt_rand(8, 19), mt_rand(0, 59));
    }

    /**
     * @param  Collection<int, ExpenseCategory>  $categories
     */
    private function seedExpenses(Collection $categories): void
    {
        $owner = User::where('role', 'owner')->first();
        $start = Carbon::now()->subMonths(self::MONTHS_OF_HISTORY)->startOfMonth();

        $recurring = [
            'Rent' => [1800, 2200],
            'Payroll' => [6000, 9000],
            'Utilities' => [200, 600],
            'Software' => [120, 400],
        ];

        for ($month = 0; $month < self::MONTHS_OF_HISTORY; $month++) {
            $monthStart = $start->copy()->addMonths($month);

            // Recurring costs are entered as individual rows in the MVP; there
            // is no recurrence automation (MVP_SCOPE.md §6.7).
            foreach ($recurring as $name => [$min, $max]) {
                $category = $categories->firstWhere('name', $name);

                $expense = new Expense([
                    'expense_category_id' => $category->id,
                    'description' => $name.' — '.$monthStart->format('F Y'),
                    'amount' => mt_rand($min * 100, $max * 100) / 100,
                    'incurred_on' => $monthStart->copy()->addDays(mt_rand(0, 5))->toDateString(),
                ]);
                $expense->created_by = $owner?->id;
                $expense->save();
            }

            // Irregular costs, so a category breakdown has something to show.
            foreach (range(1, mt_rand(2, 6)) as $ignored) {
                $category = $categories->random();

                $expense = new Expense([
                    'expense_category_id' => $category->id,
                    'description' => ucfirst(fake()->words(3, true)),
                    'amount' => mt_rand(3000, 180000) / 100,
                    // Backdated within the month: an invoice dated last week is
                    // last week's expense, whenever it was entered.
                    'incurred_on' => $monthStart->copy()->addDays(mt_rand(0, $monthStart->daysInMonth - 1))->toDateString(),
                    'vendor' => fake()->company(),
                ]);
                $expense->created_by = $owner?->id;
                $expense->save();
            }
        }
    }
}
