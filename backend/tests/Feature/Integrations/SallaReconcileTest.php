<?php

declare(strict_types=1);

use App\Domain\Orders\OrderStatus;
use App\Models\Integration;
use App\Models\Order;
use App\Support\Tenancy\TenantQuery;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Http;

/*
|--------------------------------------------------------------------------
| Reconciling a period against Salla (P2 phase 6)
|--------------------------------------------------------------------------
|
| An importer that drops one order in fifty does not fail. It produces
| figures that are plausible, slightly low and wrong, and nothing else in
| this system would ever say so. This command is the only thing that would —
| which is why most of these tests are about the ways it could lie.
|
| A false all-clear is the failure that matters. "No differences" must mean
| the numbers were read and agreed, never that nothing was read at all.
|
*/

const ORDERS_URL = 'https://api.salla.dev/admin/v2/orders*';

beforeEach(function (): void {
    $this->connection = Integration::query()->create([
        'provider' => 'salla',
        'external_account_id' => '1305146709',
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => 'a-live-access-token',
        'refresh_token' => 'a-refresh-token',
        'token_expires_at' => CarbonImmutable::now()->addDays(10),
    ]);
});

/** An order as Salla returns it: money nested as {amount, currency}. */
function sallaOrder(int $id, string $total): array
{
    return [
        'id' => $id,
        'currency' => 'SAR',
        'amounts' => ['total' => ['amount' => $total, 'currency' => 'SAR']],
    ];
}

/** @param list<array<string, mixed>> $records */
function sallaPage(array $records, int $page = 1, int $totalPages = 1): array
{
    return [
        'data' => $records,
        'pagination' => [
            'count' => count($records),
            'total' => count($records),
            'perPage' => 60,
            'currentPage' => $page,
            'totalPages' => $totalPages,
        ],
    ];
}

/** An imported order, placed inside the period and counted by the metrics. */
function importedOrder(string $total, string $placedAt = '2026-09-10 09:00:00'): Order
{
    $order = Order::factory()->create(['status' => OrderStatus::Fulfilled->value]);

    TenantQuery::table('orders')->where('id', $order->id)->update([
        'source' => 'salla',
        'placed_at' => $placedAt,
        'total_amount' => $total,
    ]);

    return $order;
}

it('says nothing differs when the two agree', function (): void {
    importedOrder('150.000');
    importedOrder('49.500');

    Http::fake([ORDERS_URL => Http::response(sallaPage([
        sallaOrder(1, '150.000'),
        sallaOrder(2, '49.500'),
    ]))]);

    $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
        ->expectsOutputToContain('No differences.')
        ->assertSuccessful();
});

it('reports a missing order, and exits non-zero', function (): void {
    // The case the whole command exists for: the importer dropped one.
    importedOrder('150.000');

    Http::fake([ORDERS_URL => Http::response(sallaPage([
        sallaOrder(1, '150.000'),
        sallaOrder(2, '49.500'),
    ]))]);

    $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
        ->expectsOutputToContain('orders: Opsight has 1, Salla has 2.')
        ->assertFailed();
});

it('reports money that differs by a single unit', function (): void {
    importedOrder('150.000');

    Http::fake([ORDERS_URL => Http::response(sallaPage([sallaOrder(1, '150.001')]))]);

    $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
        ->assertFailed();
});

it('counts only what came from the store', function (): void {
    // A business that also records walk-in sales by hand would otherwise see
    // every one of them reported as a difference, and learn to ignore this.
    importedOrder('150.000');

    $byHand = Order::factory()->create(['status' => OrderStatus::Fulfilled->value]);
    TenantQuery::table('orders')->where('id', $byHand->id)->update([
        'source' => null,
        'placed_at' => '2026-09-11 09:00:00',
        'total_amount' => '999.000',
    ]);

    Http::fake([ORDERS_URL => Http::response(sallaPage([sallaOrder(1, '150.000')]))]);

    $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
        ->assertSuccessful();
});

it('counts only what falls inside the period', function (): void {
    importedOrder('150.000', '2026-09-10 09:00:00');
    importedOrder('77.000', '2026-10-02 09:00:00');

    Http::fake([ORDERS_URL => Http::response(sallaPage([sallaOrder(1, '150.000')]))]);

    $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
        ->assertSuccessful();
});

it('walks every page rather than reading the first and stopping', function (): void {
    // Sixty orders a page: reading one page and calling it the period would
    // report a shortfall on every busy month.
    importedOrder('100.000');
    importedOrder('200.000');

    Http::fake([
        ORDERS_URL => Http::sequence()
            ->push(sallaPage([sallaOrder(1, '100.000')], page: 1, totalPages: 2))
            ->push(sallaPage([sallaOrder(2, '200.000')], page: 2, totalPages: 2)),
    ]);

    $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
        ->expectsOutputToContain('No differences.')
        ->assertSuccessful();
});

describe('never a false all-clear', function (): void {
    it('fails rather than agreeing when Salla answers a shape it cannot read', function (): void {
        importedOrder('150.000');

        // No `data` array. The tempting reading is "no orders", which would
        // report a difference — or, with nothing imported either, agreement.
        Http::fake([ORDERS_URL => Http::response(['result' => 'success'])]);

        $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
            ->expectsOutputToContain('could not be reconciled')
            ->assertFailed();
    });

    it('fails rather than agreeing when the page count cannot be trusted', function (): void {
        // Without a pagination block there is no way to know whether this is
        // the whole period or the first sixty of it.
        Http::fake([ORDERS_URL => Http::response(['data' => []])]);

        $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
            ->expectsOutputToContain('could not be reconciled')
            ->assertFailed();
    });

    it('fails rather than treating an unreadable total as zero', function (): void {
        // A zero here would quietly make Salla's side look smaller, which
        // reads as "our importer added one" — the opposite of the truth.
        importedOrder('150.000');

        Http::fake([ORDERS_URL => Http::response(sallaPage([
            ['id' => 7, 'currency' => 'SAR', 'amounts' => []],
        ]))]);

        $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
            ->expectsOutputToContain('could not be reconciled')
            ->assertFailed();
    });

    it('fails rather than agreeing when Salla is unreachable', function (): void {
        Http::fake([ORDERS_URL => Http::response('', 500)]);

        $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
            ->expectsOutputToContain('could not be reconciled')
            ->assertFailed();
    });
});

it('says plainly when no store is connected, and does not call that a failure', function (): void {
    // A cron that mails on a non-zero exit must not mail nightly about an
    // installation that has simply not connected anything.
    $this->connection->delete();

    Http::fake();

    $this->artisan('opsight:salla:reconcile', ['from' => '2026-09-01', 'to' => '2026-09-30'])
        ->expectsOutputToContain('No business has connected a Salla store.')
        ->assertSuccessful();

    Http::assertNothingSent();
});
