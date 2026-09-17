<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Customer;
use App\Models\User;

/*
|--------------------------------------------------------------------------
| Rate limits are independent of one another
|--------------------------------------------------------------------------
|
| SECURITY.md §7 documents four separate budgets: 120/min for the API, 60/min
| for analytics, 10/hour for export, 10/min as a login backstop. This file
| exists because they were NOT separate.
|
| Laravel's unnamed `throttle:X,Y` middleware keys its counter on the user's
| id alone. Nest two of them — the export group inside the general API group
| — and both increment and read ONE counter. The export check then refused a
| user's first export of the day because they had made ten ordinary requests
| a minute earlier, while the analytics limit was spending the general budget
| twice per request. Nothing errored; the documented limits simply were not
| the limits in force.
|
| It was caught by the end-to-end suite, where the export test passed alone
| and failed after the rest of the suite had browsed the application first.
|
*/

it('lets a user export after browsing, because browsing is a different budget', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();
    Customer::factory()->count(2)->create();

    // Comfortably more than the export limit's ten, and well under the
    // general API limit's 120.
    foreach (range(1, 15) as $ignored) {
        $this->actingAs($analyst)->getJson('/api/v1/customers')->assertOk();
    }

    $this->actingAs($analyst)->get('/api/v1/customers/export')->assertOk();
});

it('still refuses the eleventh export in the hour', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();
    Customer::factory()->count(2)->create();

    foreach (range(1, 10) as $ignored) {
        $this->actingAs($analyst)->get('/api/v1/customers/export')->assertOk();
    }

    $this->actingAs($analyst)
        ->getJson('/api/v1/customers/export')
        ->assertStatus(429)
        ->assertHeader('Retry-After');
});

it('does not spend the analytics budget on ordinary requests', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();

    // Seventy ordinary requests: above the analytics limit of sixty, within the
    // general limit of 120.
    foreach (range(1, 70) as $ignored) {
        $this->actingAs($analyst)->getJson('/api/v1/customers?per_page=1');
    }

    $this->actingAs($analyst)->getJson('/api/v1/analytics/summary')->assertOk();
});

it('does not let health checks spend the login backstop', function (): void {
    User::factory()->create(['email' => 'layla@opsight.test']);

    // A monitor polling /health from the same address as the office must not
    // lock people out of signing in.
    foreach (range(1, 12) as $ignored) {
        $this->getJson('/api/v1/health')->assertOk();
    }

    $this->postJson('/api/v1/auth/login', [
        'email' => 'layla@opsight.test',
        'password' => 'password',
    ])->assertOk();
});
