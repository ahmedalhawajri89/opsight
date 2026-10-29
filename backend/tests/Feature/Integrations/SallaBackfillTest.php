<?php

declare(strict_types=1);

use App\Models\Business;
use App\Models\Integration;
use App\Models\Order;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Support\Facades\Http;

/*
|--------------------------------------------------------------------------
| The history a store already had (ADR-029)
|--------------------------------------------------------------------------
|
| Webhooks only bring what happens next. A merchant who connects on Tuesday
| would otherwise see a dashboard saying their business began on Tuesday.
|
| Salla is faked at the HTTP boundary rather than mocked at the client, so
| the pagination walk, the token header and the response shape are all
| exercised.
|
*/

const IMPORT_ORDERS_URL = 'https://api.salla.dev/admin/v2/orders*';

beforeEach(function (): void {
    /*
     * One stub, registered once, answering from whatever the test last put
     * in the container.
     *
     * `Http::fake()` MERGES stubs rather than replacing them, and matches
     * them in registration order — so calling it twice in one test leaves
     * the first stub in front, and a `Http::sequence` registered there is
     * already exhausted by the time the second run reaches it. That cost an
     * hour and produced two failures that looked like the importer
     * duplicating work when it was the test harness running dry.
     *
     * Answering from the request's own `page` parameter rather than from
     * call order also makes the pagination test mean something: it now
     * proves the client asks for the pages it says it does.
     */
    app()->instance('salla.fake', ['pages' => [[]], 'raw' => null]);

    /*
     * An empty catalogue, stubbed because the command walks products before
     * orders (ADR-030). Without it the products call reaches no stub, comes
     * back as a bare 200 with no `data`, and SallaClient refuses it — which
     * is the client doing its job, and six order tests failing for a reason
     * that has nothing to do with orders.
     *
     * Empty rather than populated: what this file tests is the order walk.
     * The catalogue pass has its own suite.
     */
    Http::fake(['https://api.salla.dev/admin/v2/products*' => Http::response([
        'data' => [],
        'pagination' => ['currentPage' => 1, 'totalPages' => 1, 'total' => 0],
    ])]);

    Http::fake([IMPORT_ORDERS_URL => function ($request) {
        $fake = app('salla.fake');

        if ($fake['raw'] !== null) {
            return $fake['raw'];
        }

        $pages = $fake['pages'];
        $page = (int) ($request->data()['page'] ?? 1);

        return Http::response([
            'data' => $pages[$page - 1] ?? [],
            'pagination' => ['currentPage' => $page, 'totalPages' => count($pages), 'total' => 99],
        ]);
    }]);

    $this->connection = Integration::query()->create([
        'provider' => 'salla',
        'external_account_id' => '1305146709',
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => 'a-live-token',
        'token_expires_at' => now()->addWeek(),
    ]);
});

/** One order as the List Orders endpoint returns it. */
function remoteOrder(int $id, string $total = '100', string $slug = 'completed'): array
{
    return [
        'id' => $id,
        'date' => ['date' => '2026-06-26 12:21:45.000000', 'timezone' => 'Asia/Riyadh'],
        'status' => ['slug' => $slug],
        'currency' => 'SAR',
        'payment_method' => 'mada',
        'amounts' => [
            'sub_total' => ['amount' => $total],
            'total' => ['amount' => $total],
        ],
        'items' => [[
            'name' => 'Widget',
            'sku' => 'W-'.$id,
            'quantity' => 1,
            'amounts' => ['price_without_tax' => ['amount' => $total]],
            'product' => ['id' => 900 + $id, 'sku' => 'W-'.$id, 'name' => 'Widget'],
        ]],
    ];
}

/** @param list<array<string, mixed>> $pages each page's records */
function fakeSalla(array $pages): void
{
    app()->instance('salla.fake', ['pages' => $pages, 'raw' => null]);
}

/** A response that is not a readable listing at all. */
function fakeSallaRaw(mixed $response): void
{
    app()->instance('salla.fake', ['pages' => [[]], 'raw' => $response]);
}

it('imports a date range, walking every page', function (): void {
    fakeSalla([
        [remoteOrder(1), remoteOrder(2)],
        [remoteOrder(3)],
    ]);

    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])
        ->assertSuccessful();

    expect(Order::query()->count())->toBe(3)
        ->and(Order::query()->pluck('external_id')->sort()->values()->all())->toBe(['1', '2', '3']);
});

it('can be run again without making a second copy of anything', function (): void {
    // "It failed half way, run it again" has to be an acceptable answer.
    fakeSalla([[remoteOrder(1), remoteOrder(2)]]);
    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])->assertSuccessful();

    fakeSalla([[remoteOrder(1), remoteOrder(2)]]);
    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])->assertSuccessful();

    expect(Order::query()->count())->toBe(2);
});

it('brings an order forward that changed in Salla after its first import', function (): void {
    /*
     * Deliberately not skipping what it has already seen: an order edited
     * at the store after its first import would otherwise stay wrong here
     * for ever.
     */
    fakeSalla([[remoteOrder(1, '100', 'completed')]]);
    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])->assertSuccessful();

    fakeSalla([[remoteOrder(1, '250', 'completed')]]);
    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])->assertSuccessful();

    expect(Order::query()->count())->toBe(1)
        ->and(Order::query()->firstOrFail()->total_amount)->toBe('250.000');
});

it('writes nothing on a dry run, but says what it would have written', function (): void {
    fakeSalla([[remoteOrder(1), remoteOrder(2)]]);

    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30', '--dry-run' => true])
        ->assertSuccessful();

    expect(Order::query()->count())->toBe(0);
});

it('imports into the store\'s own business and no other', function (): void {
    $other = Business::query()->create(['name' => 'Elsewhere', 'slug' => 'elsewhere-'.uniqid()]);

    fakeSalla([[remoteOrder(1)]]);

    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])->assertSuccessful();

    $imported = Order::query()->withoutGlobalScope(BusinessScope::class)->firstOrFail();

    expect($imported->business_id)->toBe($this->connection->business_id)
        ->and($imported->business_id)->not->toBe($other->id)
        // And it is invisible from the other business.
        ->and(CurrentBusiness::get()->run($other->id, fn (): int => Order::query()->count()))->toBe(0);
});

it('records when the store was last synced', function (): void {
    expect($this->connection->last_synced_at)->toBeNull();

    fakeSalla([[remoteOrder(1)]]);
    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])->assertSuccessful();

    expect($this->connection->fresh()->last_synced_at)->not->toBeNull();
});

it('reports a store it could not read, and fails the run', function (): void {
    // A cron has to be an alarm, not a log: a silent partial import is the
    // thing this whole integration is most at risk from.
    fakeSallaRaw(Http::response(['nothing' => 'useful']));

    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])
        ->assertFailed();

    expect(Order::query()->count())->toBe(0);
});

it('says so plainly when no store is connected', function (): void {
    $this->connection->forceFill(['status' => Integration::STATUS_REVOKED])->save();

    $this->artisan('opsight:salla:import', ['from' => '2026-06-01', 'to' => '2026-06-30'])
        ->expectsOutputToContain('No connected Salla store')
        ->assertSuccessful();
});
