<?php

declare(strict_types=1);

use App\Jobs\Middleware\WithBusinessContext;
use App\Models\Business;
use App\Models\Customer;
use App\Models\Product;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use App\Support\Tenancy\MissingBusinessContext;

/*
|--------------------------------------------------------------------------
| Background work in a shared database (ADR-027)
|--------------------------------------------------------------------------
|
| Every read in this system is filtered by the business in context, and in a
| request that comes from the signed-in user. A queued job has no signed-in
| user: it runs in a worker that has just finished a job for somebody else.
|
| These test the middleware directly, with a stub job, because that is the
| piece every future job depends on — and because a test that goes through a
| real job proves the job, not the mechanism.
|
*/

/** A stand-in for any queued job: carries a business, does something scoped. */
function stubJob(?int $businessId, callable $work): object
{
    return new class($businessId, $work)
    {
        public function __construct(public readonly ?int $businessId, private $work) {}

        public function run(): mixed
        {
            return ($this->work)();
        }
    };
}

function throughMiddleware(object $job): mixed
{
    return (new WithBusinessContext)->handle($job, fn (object $j): mixed => $j->run());
}

it('runs the job as the business it was queued for', function (): void {
    $other = Business::query()->create(['name' => 'Al Noor Trading', 'slug' => 'al-noor-'.uniqid()]);

    CurrentBusiness::get()->run($other->id, fn () => Customer::query()->create(['name' => 'Their Customer']));
    Customer::query()->create(['name' => 'My Customer']);
    Customer::query()->create(['name' => 'My Other Customer']);

    $seen = throughMiddleware(stubJob($other->id, fn (): array => [
        'count' => Customer::query()->count(),
        'names' => Customer::query()->pluck('name')->all(),
    ]));

    expect($seen['count'])->toBe(1)
        ->and($seen['names'])->toBe(['Their Customer']);
});

it('does not inherit the business the worker last ran as', function (): void {
    /*
     * The failure mode this exists for. `CurrentBusiness` is container-scoped
     * and Laravel flushes scoped instances between jobs — "should" being the
     * operative word, and not something anyone can act on. Here a business is
     * firmly in context before the job runs, standing in for the previous
     * job on a long-lived worker.
     */
    $other = Business::query()->create(['name' => 'Elsewhere', 'slug' => 'elsewhere-'.uniqid()]);
    $mine = CurrentBusiness::get()->id();

    CurrentBusiness::get()->run($other->id, fn () => Product::factory()->create(['name' => 'Their Product']));

    expect(CurrentBusiness::get()->id())->toBe($mine);

    $seen = throughMiddleware(stubJob($other->id, fn (): array => Product::query()->pluck('name')->all()));

    expect($seen)->toBe(['Their Product']);
});

it('restores the caller\'s context afterwards, however the job ends', function (): void {
    $other = Business::query()->create(['name' => 'Elsewhere', 'slug' => 'elsewhere-'.uniqid()]);
    $mine = CurrentBusiness::get()->id();

    throughMiddleware(stubJob($other->id, fn (): bool => true));
    expect(CurrentBusiness::get()->id())->toBe($mine);

    // And when it throws: a job dispatched synchronously inside a request
    // must not leave that request acting for somebody else.
    expect(fn () => throughMiddleware(stubJob($other->id, function (): void {
        throw new RuntimeException('boom');
    })))->toThrow(RuntimeException::class);

    expect(CurrentBusiness::get()->id())->toBe($mine);
});

it('refuses to run a job that names no business at all', function (): void {
    // It must not quietly run "for everyone". The scope fails closed, so the
    // job would see nothing and report success having done nothing.
    expect(fn () => throughMiddleware(stubJob(null, fn (): bool => true)))
        ->toThrow(MissingBusinessContext::class);
});

it('writes into the job\'s business, not the caller\'s', function (): void {
    $other = Business::query()->create(['name' => 'Elsewhere', 'slug' => 'elsewhere-'.uniqid()]);

    throughMiddleware(stubJob($other->id, fn () => Customer::query()->create(['name' => 'Made By A Job'])));

    $written = Customer::query()
        ->withoutGlobalScope(BusinessScope::class)
        ->where('name', 'Made By A Job')
        ->firstOrFail();

    expect($written->business_id)->toBe($other->id)
        // And it is invisible from the business that queued it.
        ->and(Customer::query()->where('name', 'Made By A Job')->exists())->toBeFalse();
});
