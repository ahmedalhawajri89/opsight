<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Domain\Compliance\EraseCustomer;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\Order;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Everything held about one person, for a data-subject request (ADR-026)
|--------------------------------------------------------------------------
*/

function subject(): Customer
{
    return Customer::create([
        'name' => 'Khalid Al Mutairi',
        'email' => 'khalid@customers.test',
        'phone' => '+97333001122',
        'country' => 'BH',
    ]);
}

it('returns the person, their orders, and a filename to save it under', function (): void {
    $customer = subject();
    Order::factory()->count(2)->forCustomer($customer)->create();

    $response = $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertOk()
        ->assertJsonPath('data.customer.email', 'khalid@customers.test')
        ->assertJsonPath('meta.order_count', 2);

    expect($response->json('data.orders'))->toHaveCount(2)
        ->and($response->headers->get('Content-Disposition'))
        ->toContain('attachment; filename="customer-'.$customer->id.'-')
        ->and($response->headers->get('X-Content-Type-Options'))->toBe('nosniff');
});

it('serialises orders through the resource the screens use, not a second shape', function (): void {
    // available_actions is produced by OrderResource and by nothing else, so
    // its presence proves the redaction is inherited rather than rebuilt.
    $customer = subject();
    Order::factory()->forCustomer($customer)->create();

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertOk()
        ->assertJsonStructure(['data' => ['orders' => [['id', 'reference', 'status', 'available_actions']]]]);
});

it('gives an Analyst no audit trail at all, rather than an empty one', function (): void {
    /*
     * The side door. An Analyst holds customers.export but NOT activity.view,
     * so including the trail unconditionally would widen their access through
     * a route that does not look like the activity screen. A denied section is
     * OMITTED, the same rule the resources use for a denied field.
     */
    $customer = subject();

    $this->actingAs(User::factory()->role(Role::Analyst)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertOk()
        ->assertJsonMissingPath('data.activity')
        ->assertJsonPath('meta.includes_activity', false);

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertOk()
        ->assertJsonPath('meta.includes_activity', true)
        ->assertJsonStructure(['data' => ['activity']]);
});

it('carries no other customer in the payload', function (): void {
    $customer = subject();
    $other = Customer::create(['name' => 'Someone Else', 'email' => 'else@customers.test']);
    Order::factory()->forCustomer($other)->create();

    $response = $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertOk();

    expect(str_contains($response->getContent(), 'else@customers.test'))->toBeFalse()
        ->and(str_contains($response->getContent(), 'Someone Else'))->toBeFalse();
});

it('records that the dossier was released', function (): void {
    $customer = subject();

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertOk();

    $row = ActivityLog::query()->where('action', 'customer.exported')->firstOrFail();

    expect($row->subject_id)->toBe($customer->id)
        ->and($row->context['resource'])->toBe('customer-data')
        ->and($row->context['includes_activity'])->toBeTrue();
});

it('refuses a dossier larger than the export cap, like every other export', function (): void {
    config(['export.max_rows' => 1]);

    $customer = subject();
    Order::factory()->count(2)->forCustomer($customer)->create();

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertUnprocessable();
});

it('is closed to Staff, who have no export rights at all', function (): void {
    $customer = subject();

    $this->actingAs(User::factory()->role(Role::Staff)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertForbidden();
});

it('shows an erased customer as erased rather than pretending they were never here', function (): void {
    $customer = subject();

    app(EraseCustomer::class)($customer, 'Subject request');

    $this->actingAs(User::factory()->role(Role::Owner)->create())
        ->getJson("/api/v1/customers/{$customer->id}/export")
        ->assertOk()
        ->assertJsonPath('data.customer.name', '[erased]')
        ->assertJsonPath('data.customer.email', null);
});
