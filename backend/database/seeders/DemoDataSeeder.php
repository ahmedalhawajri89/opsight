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
use App\Domain\Payments\PaymentMethod;
use App\Domain\Payments\RecordPayment;
use App\Models\Business;
use App\Models\BusinessSetting;
use App\Models\Category;
use App\Models\Customer;
use App\Models\Expense;
use App\Models\ExpenseCategory;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use App\Support\Money;
use App\Support\Tenancy\CurrentBusiness;
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
        // Run on its own (`--class=DemoDataSeeder`), it seeds the default
        // business; called from DatabaseSeeder, whichever is in context.
        if (CurrentBusiness::get()->idOrNull() === null) {
            CurrentBusiness::get()->set(Business::query()->where('slug', 'default')->valueOrFail('id'));
        }

        mt_srand(self::RANDOM_SEED);

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

    /**
     * What an office and business supplies trader in Bahrain carries: name,
     * Arabic name, and what a unit costs it in dinars. Real goods with real
     * names, because the demo is read as well as clicked: a catalogue of
     * placeholder words reads as an unfinished product.
     *
     * @var array<string, list<array{0: string, 1: string, 2: float}>>
     */
    private const CATALOGUE = [
        'Electronics' => [
            ['Laptop 14" Core i5, 16 GB', 'لابتوب ١٤ إنش Core i5 بذاكرة 16GB', 245.0],
            ['Laptop 15" Core i7, 32 GB', 'لابتوب ١٥ إنش Core i7 بذاكرة 32GB', 365.0],
            ['27" 4K monitor', 'شاشة ٢٧ إنش بدقة 4K', 98.0],
            ['24" office monitor', 'شاشة مكتبية ٢٤ إنش', 46.0],
            ['Mono laser printer', 'طابعة ليزر أبيض وأسود', 62.0],
            ['Colour multifunction printer', 'طابعة ملوّنة متعدّدة الوظائف', 138.0],
            ['Wi-Fi 6 router', 'راوتر Wi-Fi 6', 34.0],
            ['UPS 1500 VA', 'مزوّد طاقة احتياطي UPS 1500VA', 72.0],
        ],
        'Office Supplies' => [
            ['A4 copy paper, box of 5 reams', 'ورق تصوير A4، كرتون ٥ رزم', 6.2],
            ['Ballpoint pens, box of 50', 'أقلام حبر جاف، علبة ٥٠ قلماً', 2.1],
            ['Lever arch files, pack of 10', 'ملفات حفظ بذراع، ١٠ قطع', 4.8],
            ['Sticky notes, pack of 12', 'أوراق لاصقة، ١٢ دفتراً', 1.9],
            ['Whiteboard 120 × 90 cm', 'سبّورة بيضاء ١٢٠ × ٩٠ سم', 14.5],
            ['Heavy-duty stapler', 'دبّاسة للاستخدام الكثيف', 5.4],
            ['Desk organiser set', 'طقم منظّم مكتب', 3.6],
            ['Cross-cut paper shredder', 'آلة تقطيع ورق', 38.0],
            ['A3 laminator', 'آلة تغليف حراري A3', 22.0],
        ],
        'Furniture' => [
            ['Ergonomic office chair', 'كرسي مكتب مريح', 68.0],
            ['Executive desk 180 cm', 'مكتب تنفيذي ١٨٠ سم', 145.0],
            ['Height-adjustable desk', 'مكتب بارتفاع قابل للتعديل', 118.0],
            ['Meeting table, eight seats', 'طاولة اجتماعات لثمانية أشخاص', 210.0],
            ['Visitor chair', 'كرسي زوّار', 24.0],
            ['Three-drawer filing cabinet', 'خزانة ملفات بثلاثة أدراج', 52.0],
            ['Steel storage cupboard', 'خزانة تخزين معدنية', 74.0],
            ['Reception sofa, three-seater', 'كنبة استقبال بثلاثة مقاعد', 165.0],
        ],
        'Consumables' => [
            ['Black toner cartridge', 'حبر طابعة ليزر أسود', 18.0],
            ['Colour ink cartridge set', 'طقم أحبار ملوّنة', 21.0],
            ['Drinking water, 48 bottles', 'مياه شرب، ٤٨ عبوة', 2.4],
            ['Arabic coffee, 1 kg', 'قهوة عربية، ١ كغ', 5.8],
            ['Tea bags, box of 100', 'شاي أكياس، علبة ١٠٠', 1.6],
            ['Hand sanitiser, 5 L', 'معقّم يدين، ٥ لترات', 4.2],
            ['Paper towels, 12 rolls', 'مناشف ورقية، ١٢ لفّة', 3.1],
            ['Bin liners, roll of 50', 'أكياس نفايات، لفّة ٥٠ كيساً', 1.2],
        ],
        'Accessories' => [
            ['Wireless keyboard and mouse', 'لوحة مفاتيح وفأرة لاسلكية', 11.5],
            ['USB-C docking station', 'محطة توصيل USB-C', 39.0],
            ['Noise-cancelling headset', 'سمّاعة رأس بعزل الضوضاء', 27.0],
            ['1080p webcam', 'كاميرا ويب 1080p', 15.0],
            ['Laptop backpack', 'حقيبة ظهر للابتوب', 9.5],
            ['Dual monitor arm', 'حامل لشاشتين', 19.0],
            ['HDMI cable, 2 m', 'كيبل HDMI بطول ٢ م', 1.4],
        ],
    ];

    /** @var array<string, string> */
    private const CATEGORIES_AR = [
        'Electronics' => 'إلكترونيات',
        'Office Supplies' => 'قرطاسية ولوازم مكتبية',
        'Furniture' => 'أثاث مكتبي',
        'Consumables' => 'مستهلكات',
        'Accessories' => 'إكسسوارات',
    ];

    /** @return Collection<string, Category> keyed by English name */
    private function seedCategories()
    {
        // firstOrCreate so a partially-failed run can be repeated without
        // first dropping the database by hand.
        return collect(self::CATEGORIES_AR)->map(fn (string $nameAr, string $name): Category => Category::firstOrCreate(
            ['slug' => Str::slug($name)],
            ['name' => $name, 'name_ar' => $nameAr],
        ));
    }

    /** A shelf price in dinars: to the nearest 50 fils, as a shop would set it. */
    private function shelfPrice(float $amount): float
    {
        return max(0.05, round($amount * 20) / 20);
    }

    /**
     * @param  Collection<string, Category>  $categories
     * @return Collection<int, Product>
     */
    private function seedProducts(Collection $categories): Collection
    {
        $adjust = app(AdjustStock::class);
        $owner = User::where('role', 'owner')->first();

        $products = collect();
        $index = 0;

        foreach (self::CATALOGUE as $categoryName => $items) {
            foreach ($items as [$name, $nameAr, $cost]) {
                $index++;

                // Built then saved, not ::create(): sku is immutable and
                // therefore not fillable, so it is assigned once here.
                $product = new Product([
                    'name' => $name,
                    'name_ar' => $nameAr,
                    'category_id' => $categories[$categoryName]->id,
                    'price' => $this->shelfPrice($cost * (mt_rand(130, 190) / 100)),
                    'cost' => $cost,
                    'unit' => 'piece',
                    'low_stock_threshold' => mt_rand(5, 20),
                ]);

                $product->sku = 'SKU-'.str_pad((string) $index, 4, '0', STR_PAD_LEFT);
                $product->created_by = $owner?->id;
                $product->save();

                app(StockLedger::class)
                    ->createItemForProduct($product, (int) $product->low_stock_threshold);

                // Opening stock through the ledger, so the invariant holds from
                // the product's first moment.
                $adjust->restock($product, mt_rand(60, 400), (string) $cost, 'Opening stock', $owner?->id);

                $products->push($product);
            }
        }

        return $products;
    }

    /** @var list<array{0: string, 1: string}> Invented names, English and Arabic. */
    private const NAME_STEMS = [
        ['Dilmun', 'دلمون'], ['Awal', 'أوال'], ['Tylos', 'تايلوس'], ['Pearl Coast', 'ساحل اللؤلؤ'],
        ['Seef Bay', 'خليج السيف'], ['Nakheel', 'النخيل'], ['Al Fanar', 'الفنار'], ['Al Waha', 'الواحة'],
        ['Gulf Crest', 'قمّة الخليج'], ['Al Bustan', 'البستان'], ['Sanad', 'سند'], ['Al Manara', 'المنارة'],
        ['Arad', 'عراد'], ['Al Areen', 'العرين'], ['Blue Lagoon', 'البحيرة الزرقاء'],
    ];

    /** @var list<array{0: string, 1: string}> `{n}` is the stem. */
    private const KINDS = [
        ['{n} Contracting W.L.L.', '{n} للمقاولات ذ.م.م'],
        ['{n} Dental Clinic', 'عيادة {n} لطب الأسنان'],
        ['{n} Real Estate', '{n} العقارية'],
        ['{n} Logistics', '{n} للخدمات اللوجستية'],
        ['{n} Consultancy', '{n} للاستشارات'],
        ['{n} Private School', 'مدرسة {n} الخاصة'],
        ['{n} Engineering', '{n} الهندسية'],
        ['{n} Hotel', 'فندق {n}'],
        ['{n} Medical Centre', 'مركز {n} الطبي'],
        ['{n} Travel', '{n} للسفر والسياحة'],
    ];

    /** @var list<array{0: string, 1: string}> */
    private const FIRST_NAMES = [
        ['Ahmed', 'أحمد'], ['Fatima', 'فاطمة'], ['Hussain', 'حسين'], ['Maryam', 'مريم'], ['Ali', 'علي'],
        ['Zainab', 'زينب'], ['Yousif', 'يوسف'], ['Noora', 'نورة'], ['Khalid', 'خالد'], ['Huda', 'هدى'],
    ];

    /** @var list<array{0: string, 1: string}> */
    private const FAMILY_NAMES = [
        ['Al Doseri', 'الدوسري'], ['Al Awadhi', 'العوضي'], ['Al Mahmood', 'المحمود'], ['Al Ansari', 'الأنصاري'],
        ['Bucheeri', 'بوجيري'], ['Al Jalahma', 'الجلاهمة'], ['Al Shehabi', 'الشهابي'], ['Al Hashimi', 'الهاشمي'],
    ];

    private const CITIES = [
        'Manama', 'Muharraq', 'Riffa', 'Isa Town', 'Hamad Town', 'Sitra', 'Budaiya',
        'Seef', 'Juffair', 'A\'ali', 'Tubli', 'Hidd', 'Saar', 'Zallaq',
    ];

    /**
     * The month of the history each ordering customer starts buying in,
     * keyed by customer id. Most were there from the start; the rest arrive
     * about one a month, so "new customers" is a real figure in any recent
     * period rather than a permanent zero.
     *
     * @var array<int, int>
     */
    private array $joinsAt = [];

    /** @return Collection<int, Customer> */
    private function seedCustomers()
    {
        $customers = collect();
        $names = $this->customerNames(68);
        $start = Carbon::now()->subMonths(self::MONTHS_OF_HISTORY)->startOfMonth();

        foreach (array_slice($names, 0, 60) as $i => [$name, $nameAr, $email]) {
            $customer = Customer::create([
                'name' => $name,
                'name_ar' => $nameAr,
                'email' => $email,
                'phone' => sprintf('+973 3%03d %04d', mt_rand(0, 999), mt_rand(0, 9999)),
                'city' => self::CITIES[mt_rand(0, count(self::CITIES) - 1)],
                'country' => 'BH',
            ]);

            $joins = $i < 24 ? 0 : (int) round(($i - 24) * self::MONTHS_OF_HISTORY / 35);
            $this->joinsAt[$customer->id] = $joins;

            // On the books from the month they first buy, not from the seeding.
            DB::table('customers')->where('id', $customer->id)->update([
                'created_at' => $start->copy()->addMonths($joins)->addDays(mt_rand(0, 9))->min(now()),
            ]);

            $customers->push($customer);
        }

        // Customers with NO orders at all — they must not distort averages, and
        // a metric that divides by "all customers" will be caught by them.
        foreach (array_slice($names, 60) as [$name, $nameAr, $email]) {
            Customer::create([
                'name' => $name,
                'name_ar' => $nameAr,
                'email' => $email,
                'country' => 'BH',
            ]);
        }

        return $customers;
    }

    /**
     * Distinct customer names, English and Arabic, with an address on a
     * reserved .test domain: about four businesses to every individual, as a
     * supplies trader sells mostly to companies.
     *
     * @return list<array{0: string, 1: string, 2: string}>
     */
    private function customerNames(int $count): array
    {
        $names = [];

        while (count($names) < $count) {
            if (mt_rand(1, 5) === 1) {
                [$first, $firstAr] = self::FIRST_NAMES[mt_rand(0, count(self::FIRST_NAMES) - 1)];
                [$family, $familyAr] = self::FAMILY_NAMES[mt_rand(0, count(self::FAMILY_NAMES) - 1)];
                $name = "{$first} {$family}";
                $entry = [$name, "{$firstAr} {$familyAr}", Str::slug($name, '.').'@mail.test'];
            } else {
                [$stem, $stemAr] = self::NAME_STEMS[mt_rand(0, count(self::NAME_STEMS) - 1)];
                [$kind, $kindAr] = self::KINDS[mt_rand(0, count(self::KINDS) - 1)];
                $name = str_replace('{n}', $stem, $kind);
                $entry = [$name, str_replace('{n}', $stemAr, $kindAr), 'accounts@'.Str::slug(str_replace('W.L.L.', '', $name)).'.test'];
            }

            $names[$name] ??= $entry;
        }

        return array_values($names);
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
        $pay = app(RecordPayment::class);
        $adjust = app(AdjustStock::class);

        $staff = User::whereIn('role', ['staff', 'manager'])->get();
        $start = Carbon::now()->subMonths(self::MONTHS_OF_HISTORY)->startOfMonth();
        $sequence = 0;

        // Every full month, then the one in progress up to today, in
        // proportion: without it "this month" and "the last 30 days" are
        // empty, and every comparison reads as a collapse.
        for ($month = 0; $month <= self::MONTHS_OF_HISTORY; $month++) {
            $monthStart = $start->copy()->addMonths($month);
            $days = $this->daysCovered($monthStart);

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
                        'cost' => round((float) $product->cost * (mt_rand(102, 118) / 100), 3),
                        'price' => $this->shelfPrice((float) $product->price * (mt_rand(103, 122) / 100)),
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

            $ordersThisMonth = (int) round(mt_rand(55, 85) * $seasonal * $days / $monthStart->daysInMonth);

            $buying = $customers->filter(fn (Customer $c): bool => $this->joinsAt[$c->id] <= $month);
            // A customer's first month is theirs: the arrival shows as a first order.
            $arriving = $customers->filter(fn (Customer $c): bool => $this->joinsAt[$c->id] === $month && $month > 0);

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
                $placedAt = $this->businessDayIn($monthStart, $days);

                // Roughly one order in eight is walk-in trade with no customer
                // record, which new-customer metrics must exclude.
                $customer = match (true) {
                    $i < $arriving->count() => $arriving->values()[$i],
                    mt_rand(1, 8) === 1 => null,
                    default => $buying->random(),
                };

                $sequence++;
                $order = new Order([
                    'customer_id' => $customer?->id,
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
                        'product_name_ar' => $product->name_ar,
                        'product_sku' => $product->sku,
                        'unit_price' => $product->price,
                        'unit_cost' => $product->cost,
                        'quantity' => mt_rand(1, 6),
                        'line_discount' => 0,
                        'line_total' => 0,
                    ]);
                }

                /*
                 * The discount is set once the basket is known, and capped at
                 * a fifth of it. Drawing it blind produced orders discounted
                 * below nothing — which is how the missing guard in
                 * ConfirmOrder was found.
                 */
                if (mt_rand(1, 6) === 1) {
                    $basket = (string) $order->items()->selectRaw('COALESCE(SUM(unit_price * quantity), 0) AS total')->value('total');
                    $order->forceFill(['discount_amount' => Money::round(bcdiv($basket, '5', 6))])->save();
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

                $method = $this->paymentMethod();

                if ($roll <= 90) {
                    $fulfil($order);

                    // Most fulfilled orders are paid in full; a few are still
                    // being collected, so receivables are never empty.
                    if (mt_rand(1, 100) <= 95) {
                        $pay($order, (string) $order->total_amount, $method, $placedAt->copy()->addHours(mt_rand(0, 72))->min(now()));
                    } elseif (mt_rand(1, 2) === 1) {
                        $pay($order, bcdiv((string) $order->total_amount, '2', 3), $method, $placedAt->copy()->addDay()->min(now()));
                    }

                    // A small share of fulfilled orders are refunded, some in
                    // part and some in two steps (ADR-022).
                    if (mt_rand(1, 100) <= 4) {
                        $order->refresh();

                        if (mt_rand(1, 3) === 1) {
                            $refund($order, bcdiv((string) $order->total_amount, '2', 3), reason: 'Damaged item');
                            $refund($order->refresh(), bcdiv((string) $order->total_amount, '4', 3), false, reason: 'Goodwill');
                        } else {
                            $refund($order, (string) $order->total_amount, reason: 'Returned');
                        }
                    }

                    continue;
                }

                // The remainder stay confirmed but not yet fulfilled: paid up
                // front by card or wallet, or awaiting cash on delivery.
                if ($method !== PaymentMethod::CashOnDelivery && mt_rand(1, 2) === 1) {
                    $pay($order, (string) $order->total_amount, $method, $placedAt);
                }
            }
        }
    }

    /** A Gulf-shaped mix: card first, then cash on delivery, cash and wallets. */
    private function paymentMethod(): PaymentMethod
    {
        $roll = mt_rand(1, 100);

        return match (true) {
            $roll <= 40 => PaymentMethod::Card,
            $roll <= 65 => PaymentMethod::CashOnDelivery,
            $roll <= 80 => PaymentMethod::Cash,
            $roll <= 92 => PaymentMethod::Wallet,
            default => PaymentMethod::BankTransfer,
        };
    }

    /** Days of a month the history covers: all of a past one, up to today for this one. */
    private function daysCovered(Carbon $monthStart): int
    {
        return $monthStart->isSameMonth(now()) ? now()->day : $monthStart->daysInMonth;
    }

    /** A weekday-weighted instant within the month's first $days days, at a plausible hour, never ahead of now. */
    private function businessDayIn(Carbon $monthStart, int $days): Carbon
    {
        $day = $monthStart->copy()->addDays(mt_rand(0, $days - 1));

        // The business's weekend is quieter — Friday and Saturday by default,
        // not the Saturday and Sunday Carbon assumes — so most orders that land
        // on it move to the next working day.
        $weekend = BusinessSetting::current()->weekend_days ?? [5, 6];

        if (in_array($day->isoWeekday(), $weekend, true) && mt_rand(1, 100) <= 70) {
            while (in_array($day->isoWeekday(), $weekend, true)) {
                $day->addDay();
            }
        }

        return $day->setTime(mt_rand(8, 19), mt_rand(0, 59))->min(now());
    }

    /**
     * One-off bills a supplies trader pays, by expense category: what it was
     * and who sent the invoice. The suppliers are invented.
     *
     * @var array<string, list<array{0: string, 1: string|null}>>
     */
    private const IRREGULAR_COSTS = [
        'Rent' => [['Extra warehouse bay, short term', 'Sitra Storage Park'], ['Showroom space for the trade fair week', 'Seef Exhibition Halls']],
        'Payroll' => [['Overtime for the stock count weekend', null], ['Temporary drivers for year-end deliveries', 'Awal Manpower Services'], ['End-of-service settlement', null]],
        'Utilities' => [['Warehouse electricity, peak summer', null], ['Internet line upgrade', 'Tylos Telecom Solutions']],
        'Marketing' => [['Instagram ads, back-to-office campaign', 'Blue Lagoon Media'], ['Printed catalogues, 500 copies', 'Muharraq Print House'], ['Trade fair stand', 'Seef Exhibition Halls']],
        'Logistics' => [['Delivery van fuel', 'Awal Fuel Station'], ['Sea freight from Jebel Ali', 'Gulf Crest Freight'], ['Customs clearance', 'Gulf Crest Freight'], ['Courier charges', 'Muharraq Couriers']],
        'Software' => [['Accounting software licence', 'Tylos IT Solutions'], ['Domain and email renewal', 'Tylos IT Solutions']],
        'Maintenance' => [['Delivery van service', 'Riffa Auto Care'], ['Warehouse air-conditioning repair', 'Dilmun Cooling'], ['Forklift maintenance', 'Arad Equipment']],
        'Other' => [['Bank charges', null], ['Commercial registration renewal', null], ['Office refreshments', 'Al Waha Supermarket']],
    ];

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

        // Every full month, then the one in progress up to today, in
        // proportion: without it "this month" and "the last 30 days" are
        // empty, and every comparison reads as a collapse.
        for ($month = 0; $month <= self::MONTHS_OF_HISTORY; $month++) {
            $monthStart = $start->copy()->addMonths($month);
            $days = $this->daysCovered($monthStart);

            // Recurring costs are entered as individual rows in the MVP; there
            // is no recurrence automation (MVP_SCOPE.md §6.7).
            foreach ($recurring as $name => [$min, $max]) {
                $category = $categories->firstWhere('name', $name);

                $expense = new Expense([
                    'expense_category_id' => $category->id,
                    'description' => $name.' — '.$monthStart->format('F Y'),
                    'amount' => mt_rand($min * 100, $max * 100) / 100,
                    'incurred_on' => $monthStart->copy()->addDays(mt_rand(0, min(5, $days - 1)))->toDateString(),
                ]);
                $expense->created_by = $owner?->id;
                $expense->save();
            }

            // Irregular costs, so a category breakdown has something to show.
            foreach (range(1, mt_rand(2, 6)) as $ignored) {
                $category = $categories->random();
                $bills = self::IRREGULAR_COSTS[$category->name];
                [$description, $vendor] = $bills[mt_rand(0, count($bills) - 1)];

                $expense = new Expense([
                    'expense_category_id' => $category->id,
                    'description' => $description,
                    'amount' => mt_rand(3000, 180000) / 100,
                    // Backdated within the month: an invoice dated last week is
                    // last week's expense, whenever it was entered.
                    'incurred_on' => $monthStart->copy()->addDays(mt_rand(0, $days - 1))->toDateString(),
                    'vendor' => $vendor,
                ]);
                $expense->created_by = $owner?->id;
                $expense->save();
            }
        }
    }
}
