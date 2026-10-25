<?php

declare(strict_types=1);

use App\Models\Business;
use App\Models\Customer;
use App\Models\Order;
use App\Models\Product;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| What makes an import repeatable (ADR-027)
|--------------------------------------------------------------------------
|
| `source` and `external_id` land in this phase, empty, because the first
| importer needs them on the way IN. Added afterwards, they would have to be
| reconciled against whatever duplicates the first run already made.
|
| No importer exists yet, so what is under test is the guarantee the schema
| gives one: the same record from the same store cannot be created twice, and
| a manually entered record is exempt from that rule entirely.
|
*/

it('refuses a second row for the same record from the same store', function (): void {
    $first = Product::factory()->create();
    $first->forceFill(['source' => 'salla', 'external_id' => 'SKU-REMOTE-1'])->save();

    $second = Product::factory()->create();

    expect(fn () => $second->forceFill(['source' => 'salla', 'external_id' => 'SKU-REMOTE-1'])->save())
        ->toThrow(QueryException::class);
});

it('lets two businesses import a record with the same id at the provider', function (): void {
    // Two shops on Salla both have order "1001". They are different orders.
    $mine = Customer::query()->create(['name' => 'Mine']);
    $mine->forceFill(['source' => 'salla', 'external_id' => '1001'])->save();

    $other = Business::query()->create(['name' => 'Al Noor Trading', 'slug' => 'al-noor-'.uniqid()]);

    CurrentBusiness::get()->run($other->id, function (): void {
        $theirs = Customer::query()->create(['name' => 'Theirs']);
        $theirs->forceFill(['source' => 'salla', 'external_id' => '1001'])->save();
    });

    expect(DB::table('customers')->where('external_id', '1001')->count())->toBe(2);
});

it('lets the same business import the same id from two different providers', function (): void {
    $fromSalla = Customer::query()->create(['name' => 'From Salla']);
    $fromSalla->forceFill(['source' => 'salla', 'external_id' => '1001'])->save();

    $fromZid = Customer::query()->create(['name' => 'From Zid']);
    $fromZid->forceFill(['source' => 'zid', 'external_id' => '1001'])->save();

    expect(Customer::query()->count())->toBe(2);
});

it('exempts every record entered here, however many there are', function (): void {
    /*
     * The unique index covers (business_id, source, external_id), and NULLs
     * do not collide in MySQL or MariaDB — which is the behaviour that lets
     * three years of manually entered rows coexist under it. If this ever
     * fails, the index has been changed to something that locks the product
     * out of its own data entry.
     */
    Product::factory()->count(3)->create();
    Customer::query()->create(['name' => 'One']);
    Customer::query()->create(['name' => 'Two']);

    expect(Product::query()->whereNull('source')->count())->toBe(3)
        ->and(Customer::query()->whereNull('source')->count())->toBe(2);
});

it('carries the pair on all three tables an importer writes to', function (): void {
    foreach (['products', 'customers', 'orders'] as $table) {
        $columns = DB::getSchemaBuilder()->getColumnListing($table);

        // No message argument: Pest's toContain() is variadic, so a message
        // becomes a second needle and the assertion quietly tests the wrong
        // thing. The loop variable names the table in the failure anyway.
        expect(in_array('source', $columns, true))->toBeTrue("{$table} has no source column");
        expect(in_array('external_id', $columns, true))->toBeTrue("{$table} has no external_id column");
    }

    // And an order, which is the one an importer most needs to not duplicate.
    $order = Order::factory()->create();
    $order->forceFill(['source' => 'salla', 'external_id' => 'ORD-9'])->save();

    $clash = Order::factory()->create();

    expect(fn () => $clash->forceFill(['source' => 'salla', 'external_id' => 'ORD-9'])->save())
        ->toThrow(QueryException::class);
});
