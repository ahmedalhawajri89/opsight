<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Compliance\EraseCustomer;
use App\Domain\Metrics\Comparison;
use App\Domain\Metrics\MetricSummary;
use App\Domain\Metrics\Period;
use App\Domain\Metrics\QuickStats;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\User;
use Tests\Support\MetricFixture;

/*
|--------------------------------------------------------------------------
| Forgetting a person without forgetting the trade (ADR-026)
|--------------------------------------------------------------------------
|
| Erasure answers a data-subject request by overwriting the person in place.
| The orders stay, because every figure in the product is computed from them,
| and `deleted_at` stays NULL, because two metrics read it.
|
| The headline test — that MetricSummary is byte-identical across an erasure —
| is nearly true by construction, since no summary metric reads the customers
| table. That is exactly why it is paired with a control: a SOFT DELETE of the
| same customer does move the figures. Without the control, the first test
| would pass whatever the implementation did.
|
*/

/** A customer with details worth erasing. */
function erasable(string $suffix = 'one'): Customer
{
    return Customer::create([
        'name' => 'Khalid Al Mutairi',
        'name_ar' => 'خالد المطيري',
        'email' => "khalid.{$suffix}@customers.test",
        'phone' => '+97333001122',
        'company' => 'Mutairi Trading',
        'vat_number' => '200000000000003',
        'address_line' => 'Building 123, Road 456, Manama',
        'city' => 'Manama',
        'country' => 'BH',
        'notes' => 'Reach him on +97333001122 before noon',
    ]);
}

function summaryFor(User $owner): string
{
    /*
     * Resolved FRESH each time. MetricCalculator memoises aggregates for the
     * life of an instance, so reusing one summary would compare a cached value
     * against itself and prove nothing.
     */
    return (string) json_encode(
        app(MetricSummary::class)->for(
            Period::between(MetricFixture::FROM, MetricFixture::TO),
            Comparison::PreviousPeriod,
            $owner,
        ),
    );
}

/*
|--------------------------------------------------------------------------
| The acceptance test, and the control that stops it being vacuous
|--------------------------------------------------------------------------
*/

it('leaves every figure in the summary exactly as it was', function (): void {
    MetricFixture::build();

    $owner = User::factory()->role(Role::Owner)->create();
    $customer = Customer::query()->where('email', 'alpha@fixture.test')->firstOrFail();

    $before = summaryFor($owner);

    app(EraseCustomer::class)($customer, 'Subject request, ticket 118');

    expect(summaryFor($owner))->toBe($before, 'An erasure moved a reported figure.')
        ->and(json_decode($before, true)['net_revenue']['value'])
        ->toBe(MetricFixture::EXPECTED['net_revenue']);
});

it('is a different road from a soft delete, which DOES move the figures', function (): void {
    // The control. Erasure is not "delete, but thorough" — deleting this same
    // customer changes the dashboard's customer growth, and erasing does not.
    MetricFixture::build();

    $owner = User::factory()->role(Role::Owner)->create();
    $customer = Customer::query()->where('email', 'alpha@fixture.test')->firstOrFail();

    /*
     * A trailing window, not the fixture's August: QuickStats counts rows that
     * EXISTED at an instant, and the fixture's customers are created now, so
     * an August window never counted them and deleting one would move nothing.
     * The control has to measure a window the customer is actually inside.
     */
    $period = Period::trailingDays(30);

    $before = app(QuickStats::class)->for($period, $owner);

    $customer->delete();

    expect(app(QuickStats::class)->for($period, $owner))->not->toBe($before);
});

/*
|--------------------------------------------------------------------------
| What the record becomes
|--------------------------------------------------------------------------
*/

it('clears every identifying column and keeps the rest', function (): void {
    $customer = erasable();
    $createdAt = $customer->created_at;

    app(EraseCustomer::class)($customer, 'Subject request');

    $fresh = $customer->fresh();

    expect($fresh->name)->toBe('[erased]')
        ->and($fresh->name_ar)->toBeNull()
        ->and($fresh->email)->toBeNull()
        ->and($fresh->phone)->toBeNull()
        ->and($fresh->company)->toBeNull()
        ->and($fresh->vat_number)->toBeNull()
        ->and($fresh->address_line)->toBeNull()
        ->and($fresh->city)->toBeNull()
        ->and($fresh->notes)->toBeNull()
        ->and($fresh->is_active)->toBeFalse()
        ->and($fresh->erased_at)->not->toBeNull()
        // The country is not an identifier, and it is the only geography the
        // commercial record keeps.
        ->and($fresh->country)->toBe('BH')
        // Both read by metrics: soft-deleting or re-dating would move figures.
        ->and($fresh->deleted_at)->toBeNull()
        ->and($fresh->created_at->toIso8601String())->toBe($createdAt->toIso8601String());
});

it('lets a second customer be erased too, without colliding on the email', function (): void {
    // A sentinel email would collide on the unique (business_id, email) index
    // the second time. NULLs do not collide, which is why it is NULL.
    $first = erasable('one');
    $second = erasable('two');

    app(EraseCustomer::class)($first, 'Subject request');
    app(EraseCustomer::class)($second, 'Subject request');

    expect($first->fresh()->email)->toBeNull()
        ->and($second->fresh()->email)->toBeNull();
});

/*
|--------------------------------------------------------------------------
| The audit log: scrubbed of the person, not of the audit
|--------------------------------------------------------------------------
*/

it('removes the person from the log while keeping the record that it changed', function (): void {
    $customer = erasable();

    // A real edit, so there is a diff carrying the old and new address.
    $customer->update(['email' => 'khalid.new@customers.test']);

    app(EraseCustomer::class)($customer, 'Subject request');

    $rows = ActivityLog::query()->where('subject_type', 'Customer')->get();
    $json = $rows->toJson();

    expect(str_contains($json, 'khalid.one@customers.test'))->toBeFalse('The old email survived the scrub.')
        ->and(str_contains($json, 'khalid.new@customers.test'))->toBeFalse('The new email survived the scrub.')
        ->and(str_contains($json, '+97333001122'))->toBeFalse('The phone survived the scrub.')
        ->and(str_contains($json, 'Building 123'))->toBeFalse('The address survived the scrub.');

    // And the fact of the change is still there: the key remains, holding the
    // sentinel. Dropping it would erase the accountability with the data.
    $updated = $rows->firstWhere('action', 'customer.updated');

    expect($updated)->not->toBeNull()
        ->and($updated->changes['after'])->toHaveKey('email')
        ->and($updated->changes['after']['email'])->toBe('[erased]');
});

it('reaches an export row that named the person in its search filter', function (): void {
    $customer = erasable();
    $owner = User::factory()->role(Role::Owner)->create();

    // A colleague exported the customer list after searching for this email.
    // That row carries the address in `context.filters` and has no subject id,
    // so nothing but a value sweep can find it.
    $this->actingAs($owner)->get('/api/v1/customers/export?filter[search]=khalid.one@customers.test')
        ->assertOk()->streamedContent();

    app(EraseCustomer::class)($customer, 'Subject request');

    $export = ActivityLog::query()->where('action', 'export.generated')->latest('id')->first();

    expect($export)->not->toBeNull()
        ->and(str_contains((string) json_encode($export->context), 'khalid.one@customers.test'))
        ->toBeFalse('The search filter still names the erased customer.');
});

it('writes an erasure row that does not itself republish what it erased', function (): void {
    /*
     * The sharp one. AuditRecorder::diff() builds `before` from
     * getRawOriginal(), so the obvious implementation — $customer->update([…])
     * — writes the name, email, phone and address straight back into the
     * append-only table, in the same transaction that scrubbed them out.
     */
    $customer = erasable();

    app(EraseCustomer::class)($customer, 'Subject request, ticket 118');

    $row = ActivityLog::query()->where('action', 'customer.erased')->firstOrFail();

    expect($row->changes)->toBeNull()
        ->and(str_contains((string) json_encode($row->context), 'Khalid'))->toBeFalse()
        ->and(str_contains((string) json_encode($row->context), 'khalid.one@customers.test'))->toBeFalse()
        ->and($row->context['reason'])->toBe('Subject request, ticket 118');
});

/*
|--------------------------------------------------------------------------
| Over HTTP
|--------------------------------------------------------------------------
*/

it('is the Owner\'s alone', function (): void {
    $customer = erasable();
    $payload = ['reason' => 'Subject request'];

    foreach ([Role::Staff, Role::Analyst, Role::Manager] as $role) {
        $this->actingAs(User::factory()->role($role)->create())
            ->postJson("/api/v1/customers/{$customer->id}/erase", $payload)
            ->assertForbidden();
    }

    expect($customer->fresh()->erased_at)->toBeNull();

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson("/api/v1/customers/{$customer->id}/erase", $payload)
        ->assertOk()
        ->assertJsonPath('data.name', '[erased]');
});

it('will not erase without a reason', function (): void {
    $customer = erasable();

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->postJson("/api/v1/customers/{$customer->id}/erase", [])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('reason');

    expect($customer->fresh()->erased_at)->toBeNull();
});

it('refuses a second erasure as a conflict, not as a denial', function (): void {
    $customer = erasable();
    $owner = User::factory()->role(Role::Owner)->create();

    $this->actingAs($owner);
    $this->postJson("/api/v1/customers/{$customer->id}/erase", ['reason' => 'Subject request'])->assertOk();

    // 409, not 403: the operator may erase; this record's state is why it
    // cannot happen again. The screen can tell those apart.
    $this->postJson("/api/v1/customers/{$customer->id}/erase", ['reason' => 'Subject request'])
        ->assertStatus(409)
        ->assertJsonPath('code', 'customer.already_erased');
});
