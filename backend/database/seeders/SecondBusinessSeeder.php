<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Authorization\Role;
use App\Domain\Businesses\DefaultExpenseCategories;
use App\Domain\Inventory\AdjustStock;
use App\Domain\Inventory\StockLedger;
use App\Domain\Orders\ConfirmOrder;
use App\Domain\Orders\FulfilOrder;
use App\Domain\Orders\OrderReference;
use App\Domain\Payments\PaymentMethod;
use App\Domain\Payments\RecordPayment;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Customer;
use App\Models\Product;
use App\Models\User;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * A second business on the same installation (ADR-023), for local work and
 * the browser tests.
 *
 * Small on purpose, and different from the first in every way isolation could
 * hide behind: another currency (KWD, three places), another timezone, its own
 * owner, its own catalogue and customers — and order numbers that start from
 * one, like the first business's. The browser tests sign in as each owner and
 * check neither can see, search or open the other's records.
 *
 * Never seeded in production: an installation starts with no invented
 * business.
 */
class SecondBusinessSeeder extends Seeder
{
    public const SLUG = 'al-noor';

    public const OWNER_EMAIL = 'owner@alnoor.test';

    public function run(): void
    {
        $business = Business::query()->firstOrCreate(['slug' => self::SLUG], ['name' => 'Al Noor Trading']);

        if (CurrentBusiness::get()->run($business->id, fn (): bool => Product::query()->exists())) {
            return;
        }

        CurrentBusiness::get()->run($business->id, fn () => $this->seed());
    }

    private function seed(): void
    {
        mt_srand(20260923);

        BusinessSetting::ensureExists([
            'company_name' => 'Al Noor Trading',
            'currency' => 'KWD',
            'currency_decimals' => 3,
            'timezone' => 'Asia/Kuwait',
            'weekend_days' => [5, 6],
        ]);

        // Without these the expenses screen has nothing to file a cost under.
        DefaultExpenseCategories::seed('en');

        $owner = User::query()->firstOrNew(['email' => self::OWNER_EMAIL]);
        $owner->fill(['name' => 'Salem Al Noor', 'password' => 'password', 'locale' => 'en']);
        $owner->role = Role::Owner;
        $owner->is_active = true;
        $owner->save();

        $products = collect([
            ['NOOR-001', 'Saffron 10g', 'زعفران ١٠ غرام', 4.750, 2.100],
            ['NOOR-002', 'Oud incense box', 'صندوق بخور عود', 12.500, 6.000],
            ['NOOR-003', 'Dates gift tray', 'صينية تمر هدية', 8.250, 3.900],
            ['NOOR-004', 'Rose water 250ml', 'ماء ورد ٢٥٠ مل', 1.750, 0.600],
            ['NOOR-005', 'Arabic coffee 500g', 'قهوة عربية ٥٠٠ غرام', 5.500, 2.400],
        ])->map(function (array $row): Product {
            [$sku, $name, $nameAr, $price, $cost] = $row;

            // sku is immutable and therefore not fillable: assigned once here.
            $product = new Product(['name' => $name, 'name_ar' => $nameAr, 'price' => $price, 'cost' => $cost, 'unit' => 'piece']);
            $product->sku = $sku;
            $product->save();

            app(StockLedger::class)->createItemForProduct($product, 10);
            app(AdjustStock::class)->restock($product, 200, (string) $cost, 'Opening stock');

            return $product;
        });

        $customers = collect([
            ['Khalid Al Mutairi', 'khalid@alnoor-customers.test'],
            ['Fatima Al Sabah', 'fatima@alnoor-customers.test'],
            ['Mishref Catering Co.', 'orders@mishref-catering.test'],
            ['Salmiya Gift House', 'hello@salmiya-gifts.test'],
        ])->map(fn (array $row): Customer => Customer::create(['name' => $row[0], 'email' => $row[1], 'country' => 'KW']));

        $methods = [PaymentMethod::Card, PaymentMethod::CashOnDelivery, PaymentMethod::Wallet, PaymentMethod::Cash];

        foreach (range(1, 12) as $i) {
            $order = OrderReference::createOrder(['customer_id' => $customers[$i % 4]->id], $owner->id);

            foreach ($products->random(mt_rand(1, 3)) as $product) {
                $order->items()->create([
                    'product_id' => $product->id,
                    'product_name' => $product->name,
                    'product_sku' => $product->sku,
                    'unit_price' => $product->price,
                    'unit_cost' => $product->cost,
                    'quantity' => mt_rand(1, 4),
                    'line_discount' => 0,
                    'line_total' => 0,
                ]);
            }

            $order = app(ConfirmOrder::class)($order, $owner->id);
            $placedAt = now()->subDays(30 - 2 * $i)->setTime(11, 0);
            DB::table('orders')->where('id', $order->id)->update(['placed_at' => $placedAt]);
            $order->refresh();

            // The last few are still out for delivery, cash to collect.
            if ($i <= 9) {
                $order = app(FulfilOrder::class)($order);
                app(RecordPayment::class)($order, (string) $order->total_amount, $methods[$i % 4], $placedAt->copy()->addHours(3));
            }
        }
    }
}
