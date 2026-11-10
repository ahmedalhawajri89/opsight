<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Orders\OrderStatus;
use App\Domain\Payments\PaymentMethod;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\InventoryItem;
use App\Models\Order;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Testing\TestResponse;

/*
|--------------------------------------------------------------------------
| Importing from a file (ADR-039)
|--------------------------------------------------------------------------
|
| For the merchant with no store to connect. The file becomes the same
| ImportedOrder Salla and Zid produce, so the same rules hold; these tests
| are about what is particular to a file: one row per line, all or nothing,
| and safe to upload again.
|
| The default business trades in Bahraini dinars (three places) in
| Asia/Bahrain time.
|
*/

const ORDERS_CSV = <<<'CSV'
Order Number,Date,Status,SKU,Product,Qty,Unit Price,Customer,Phone,Shipping,Payment Method
1001,05/03/2026 14:30,completed,LAMP-1,Lamp,2,30,Sara Ahmed,+966501806978,5,mada
1001,05/03/2026 14:30,completed,MUG-1,Mug,1,10,Sara Ahmed,+966501806978,5,mada
1002,06/03/2026,cancelled,MUG-1,Mug,3,10,,,,
1003,07/03/2026,shipped,LAMP-1,Lamp,1,30,Huda,3600 1122,,cash on delivery
CSV;

/** The mapping the screen would send for ORDERS_CSV. */
const ORDERS_MAPPING = [
    'order_id' => 0, 'date' => 1, 'status' => 2, 'sku' => 3, 'product_name' => 4, 'quantity' => 5,
    'unit_price' => 6, 'customer_name' => 7, 'customer_phone' => 8, 'shipping' => 9, 'payment_method' => 10,
];

beforeEach(function (): void {
    RateLimiter::clear('imports');
    $this->owner = User::factory()->role(Role::Owner)->create();
});

function upload(string $content, string $name = 'orders.csv'): UploadedFile
{
    return UploadedFile::fake()->createWithContent($name, $content);
}

function importFile(string $content, array $mapping, string $kind = 'orders', bool $dryRun = false): TestResponse
{
    return test()->actingAs(test()->owner)->post('/api/v1/imports', [
        'file' => upload($content),
        'kind' => $kind,
        'mapping' => $mapping,
        'dry_run' => $dryRun ? '1' : '0',
    ], ['Accept' => 'application/json']);
}

it('reads a file\'s columns and suggests where each field is', function (): void {
    $this->actingAs($this->owner)
        ->post('/api/v1/imports/preview', ['file' => upload(ORDERS_CSV), 'kind' => 'orders'], ['Accept' => 'application/json'])
        ->assertOk()
        ->assertJsonPath('data.rows', 4)
        ->assertJsonPath('data.headers.0', 'Order Number')
        ->assertJsonPath('data.mapping.order_id', 0)
        ->assertJsonPath('data.mapping.date', 1)
        ->assertJsonPath('data.mapping.quantity', 5)
        ->assertJsonPath('data.mapping.unit_price', 6)
        ->assertJsonPath('data.fields.order_id', true)
        ->assertJsonPath('data.fields.sku', false);
});

it('checks a file without writing anything', function (): void {
    importFile(ORDERS_CSV, ORDERS_MAPPING, dryRun: true)
        ->assertOk()
        ->assertJsonPath('data.written', false)
        ->assertJsonPath('data.records', 3)
        ->assertJsonPath('data.lines', 4)
        ->assertJsonPath('data.error_count', 0);

    expect(Order::query()->count())->toBe(0);
});

it('makes one order of the rows that share an order number', function (): void {
    importFile(ORDERS_CSV, ORDERS_MAPPING)->assertCreated()->assertJsonPath('data.written', true);

    $order = Order::query()->where('source', 'file')->where('external_id', '1001')->sole();

    expect($order->items()->count())->toBe(2)
        ->and($order->subtotal_amount)->toBe('70.000')
        ->and($order->shipping_amount)->toBe('5.000')
        // No total column, so subtotal + shipping.
        ->and($order->total_amount)->toBe('75.000')
        ->and($order->status)->toBe(OrderStatus::Fulfilled)
        // 14:30 in Bahrain is 11:30 UTC; read day first, the fifth of March.
        ->and($order->placed_at->toIso8601String())->toBe('2026-03-05T11:30:00+00:00');
});

it('records a completed sale as paid, and a cash-on-delivery order on its way as owed', function (): void {
    importFile(ORDERS_CSV, ORDERS_MAPPING);

    $completed = Order::query()->where('external_id', '1001')->sole();
    $onTheWay = Order::query()->where('external_id', '1003')->sole();

    expect($completed->payments()->sole()->method)->toBe(PaymentMethod::Card)
        ->and($completed->payments()->sole()->amount)->toBe('75.000')
        ->and($onTheWay->status)->toBe(OrderStatus::Confirmed)
        ->and($onTheWay->payments()->count())->toBe(0);
});

it('keeps one customer per phone, placing a local number in the business\'s country', function (): void {
    importFile(ORDERS_CSV, ORDERS_MAPPING);

    $sara = Customer::query()->where('phone', '+966501806978')->sole();

    expect($sara->name)->toBe('Sara Ahmed')
        ->and($sara->orders()->count())->toBe(1)
        // A local number, typed with a space, in a business trading in BHD.
        ->and(Customer::query()->where('name', 'Huda')->sole()->phone)->toBe('+97336001122');
});

it('updates the same orders when the file is uploaded again', function (): void {
    /*
     * The owner's natural move after spotting a mistake is to fix the
     * spreadsheet and upload it again. That must correct, not double.
     */
    importFile(ORDERS_CSV, ORDERS_MAPPING);
    importFile(str_replace('1003,07/03/2026,shipped', '1003,07/03/2026,completed', ORDERS_CSV), ORDERS_MAPPING);

    expect(Order::query()->where('source', 'file')->count())->toBe(3)
        ->and(Order::query()->where('external_id', '1003')->sole()->status)->toBe(OrderStatus::Fulfilled);
});

it('imports nothing at all when one row is wrong, and says which', function (): void {
    $broken = ORDERS_CSV."\n1004,31/02/2026,completed,MUG-1,Mug,1,10,,,,";

    $response = importFile($broken, ORDERS_MAPPING)
        ->assertOk()
        ->assertJsonPath('data.written', false)
        ->assertJsonPath('data.error_count', 1)
        ->assertJsonPath('data.errors.0.row', 6)
        ->assertJsonPath('data.errors.0.field', 'date')
        ->assertJsonPath('data.errors.0.value', '31/02/2026');

    expect($response->json('data.errors.0.message'))->toContain('Date')
        ->and(Order::query()->count())->toBe(0);
});

it('says what is wrong in the owner\'s language', function (): void {
    $this->owner->forceFill(['locale' => 'ar'])->save();

    $response = importFile(ORDERS_CSV."\n1004,2026-03-08,on hold,MUG-1,Mug,1,10,,,,", ORDERS_MAPPING);

    expect($response->json('data.errors.0.message'))->toContain('الحالة')->toContain('on hold');
});

it('refuses a status it does not know, rather than guessing one', function (): void {
    importFile(ORDERS_CSV."\n1004,2026-03-08,on hold,MUG-1,Mug,1,10,,,,", ORDERS_MAPPING)
        ->assertJsonPath('data.errors.0.key', 'status');
});

it('refuses a fractional quantity', function (): void {
    importFile(ORDERS_CSV."\n1004,2026-03-08,completed,MUG-1,Mug,1.5,10,,,,", ORDERS_MAPPING)
        ->assertJsonPath('data.errors.0.key', 'quantity');
});

it('refuses a line with no price of any kind', function (): void {
    importFile("order,date,sku\n1,2026-03-08,MUG-1", ['order_id' => 0, 'date' => 1, 'sku' => 2])
        ->assertJsonPath('data.errors.0.key', 'price_missing');
});

it('does not move stock, because the sales happened elsewhere', function (): void {
    $lamp = Product::factory()->withStock(10)->create(['sku' => 'LAMP-1', 'cost' => '12']);

    importFile(ORDERS_CSV, ORDERS_MAPPING);

    expect(InventoryItem::query()->where('product_id', $lamp->id)->value('stock_on_hand'))->toBe(10)
        // But the existing product's cost reaches the line, so the sale has a margin.
        ->and(Order::query()->where('external_id', '1001')->sole()->items()->where('product_sku', 'LAMP-1')->sole()->unit_cost)->toBe('12.0000');
});

it('refuses a mapping that leaves out a required field', function (): void {
    importFile(ORDERS_CSV, ['order_id' => 0])
        ->assertStatus(422)
        ->assertJsonPath('code', 'import.mapping_missing');
});

it('refuses one column chosen for two fields', function (): void {
    importFile(ORDERS_CSV, ['order_id' => 0, 'date' => 0])
        ->assertStatus(422)
        ->assertJsonPath('code', 'import.mapping_duplicate');
});

it('records the import in the audit log', function (): void {
    importFile(ORDERS_CSV, ORDERS_MAPPING);

    expect(ActivityLog::query()->where('action', 'import.file')->sole()->context)->toMatchArray(['kind' => 'orders', 'records' => 3]);
});

/*
|--------------------------------------------------------------------------
| Products
|--------------------------------------------------------------------------
*/

it('imports a catalogue with its costs, matching existing products by SKU', function (): void {
    $mine = Product::factory()->create(['sku' => 'LAMP-1', 'name' => 'Old name', 'cost' => '9']);

    importFile("SKU,Name,Price,Cost\nLAMP-1,Brass lamp,60,22.5\nMUG-1,Mug,15,\n", ['sku' => 0, 'name' => 1, 'price' => 2, 'cost' => 3], 'products')
        ->assertCreated()
        ->assertJsonPath('data.records', 2);

    expect($mine->refresh()->name)->toBe('Brass lamp')
        ->and($mine->cost)->toBe('22.5000')
        ->and(Product::query()->where('sku', 'LAMP-1')->count())->toBe(1)
        ->and(Product::query()->where('sku', 'MUG-1')->sole()->price)->toBe('15.0000');
});

it('leaves a cost alone when the file has none', function (): void {
    $mine = Product::factory()->create(['sku' => 'MUG-1', 'cost' => '4']);

    importFile("SKU,Name,Price,Cost\nMUG-1,Mug,15,\n", ['sku' => 0, 'name' => 1, 'price' => 2, 'cost' => 3], 'products');

    expect($mine->refresh()->cost)->toBe('4.0000');
});

it('refuses a SKU listed twice, rather than letting the second row win quietly', function (): void {
    importFile("SKU,Name,Price\nMUG-1,Mug,15\nMUG-1,Mug large,18\n", ['sku' => 0, 'name' => 1, 'price' => 2], 'products')
        ->assertJsonPath('data.errors.0.key', 'duplicate')
        ->assertJsonPath('data.errors.0.row', 3);

    expect(Product::query()->where('sku', 'MUG-1')->exists())->toBeFalse();
});

/*
|--------------------------------------------------------------------------
| Who, and what
|--------------------------------------------------------------------------
*/

it('lets only someone who may bring records in from outside import a file', function (string $role): void {
    $user = User::factory()->role(Role::from($role))->create();

    $this->actingAs($user)
        ->post('/api/v1/imports/preview', ['file' => upload(ORDERS_CSV), 'kind' => 'orders'], ['Accept' => 'application/json'])
        ->assertForbidden();
})->with(['manager', 'analyst', 'staff']);

it('refuses a file that is not a spreadsheet', function (): void {
    $this->actingAs($this->owner)
        ->post('/api/v1/imports/preview', ['file' => UploadedFile::fake()->create('photo.png', 10, 'image/png'), 'kind' => 'orders'], ['Accept' => 'application/json'])
        ->assertStatus(422);
});

it('refuses a kind of import that does not exist', function (): void {
    $this->actingAs($this->owner)
        ->post('/api/v1/imports/preview', ['file' => upload(ORDERS_CSV), 'kind' => 'expenses'], ['Accept' => 'application/json'])
        ->assertStatus(422);
});
