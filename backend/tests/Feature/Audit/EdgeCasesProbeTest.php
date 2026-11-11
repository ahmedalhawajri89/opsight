<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\Product;
use App\Models\User;
use Illuminate\Http\UploadedFile;

/*
| Probe: unusual input on the newest endpoints. Each expectation is what a
| careful API should do; a failure here is a finding.
*/

beforeEach(function (): void {
    $this->owner = User::factory()->role(Role::Owner)->create();
});

it('refuses a cash balance dated in the future', function (): void {
    $this->actingAs($this->owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => '10', 'as_of' => now()->addDays(3)->toDateString()])
        ->assertUnprocessable()->assertJsonValidationErrors('as_of');
});

it('refuses a cash balance that is not a number', function (): void {
    $this->actingAs($this->owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => '12abc'])
        ->assertUnprocessable()->assertJsonValidationErrors('amount');
});

it('refuses a cash balance beyond the column', function (): void {
    $this->actingAs($this->owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => '99999999999999999'])
        ->assertUnprocessable();
});

it('requires the amount key, so an empty body does not silently clear the balance', function (): void {
    $this->actingAs($this->owner)->putJson('/api/v1/forecasts/cash/balance', [])
        ->assertUnprocessable()->assertJsonValidationErrors('amount');
});

it('accepts a negative balance (an overdraft is real)', function (): void {
    $this->actingAs($this->owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => '-500'])
        ->assertOk()->assertJsonPath('data.cash_balance', '-500.000');
});

it('bounds the stock forecast parameters', function (): void {
    $this->actingAs($this->owner)->getJson('/api/v1/forecasts/stock?lead_time=500')->assertUnprocessable();
    $this->actingAs($this->owner)->getJson('/api/v1/forecasts/stock?cover_days=0')->assertUnprocessable();
    $this->actingAs($this->owner)->getJson('/api/v1/forecasts/stock?lead_time=abc')->assertUnprocessable();
});

it('lets an analyst read the financing report but not set the balance', function (): void {
    $analyst = User::factory()->role(Role::Analyst)->create();

    $this->actingAs($analyst)->getJson('/api/v1/reports/financing')->assertOk();
    $this->actingAs($analyst)->putJson('/api/v1/forecasts/cash/balance', ['amount' => '1'])->assertForbidden();
});

it('refuses the financing report and cash forecast to a manager? (managers may see cost)', function (): void {
    $manager = User::factory()->role(Role::Manager)->create();

    $this->actingAs($manager)->getJson('/api/v1/reports/financing')->assertOk();
    $this->actingAs($manager)->getJson('/api/v1/forecasts/cash')->assertOk();
});

it('answers 401, not 500, to every new endpoint without a session', function (): void {
    foreach (['/api/v1/forecasts/stock', '/api/v1/forecasts/cash', '/api/v1/reports/financing', '/api/v1/roles', '/api/v1/activity/summary', '/api/v1/me/brief'] as $path) {
        $this->getJson($path)->assertUnauthorized();
    }
});

it('names an unknown filter on the activity log, rather than ignoring it', function (): void {
    $this->actingAs($this->owner)->getJson('/api/v1/activity?filter[nonsense]=1')
        ->assertUnprocessable()->assertJsonValidationErrors('filter');
});

it('answers a date filter that is not a date with a 422, on every list that has one', function (): void {
    $lists = ['/api/v1/activity' => 'from', '/api/v1/orders' => 'placed_from', '/api/v1/expenses' => 'incurred_from'];

    foreach ($lists as $path => $key) {
        foreach (['not-a-date', 'next tuesday', '2026-02-30'] as $value) {
            $this->actingAs($this->owner)->getJson($path."?filter[{$key}]=".urlencode($value))
                ->assertUnprocessable()->assertJsonValidationErrors('filter');
        }

        $this->actingAs($this->owner)->getJson($path."?filter[{$key}]=2026-01-01")->assertOk();
    }
});

it('rejects a garbage cursor on the activity log without a server error', function (): void {
    $status = $this->actingAs($this->owner)->getJson('/api/v1/activity?cursor=%%%garbage')->status();

    expect($status)->toBeLessThan(500);
});

it('refuses a WhatsApp number of absurd length', function (): void {
    $this->actingAs($this->owner)->patchJson('/api/v1/me/preferences', ['whatsapp_phone' => str_repeat('9', 300)])
        ->assertUnprocessable();
});

it('refuses an unknown brief channel', function (): void {
    $this->actingAs($this->owner)->patchJson('/api/v1/me/preferences', ['brief_channel' => 'sms'])
        ->assertUnprocessable();
});

it('refuses an empty assistant message and an enormous one', function (): void {
    config(['assistant.api_key' => 'test-key']);

    $this->actingAs($this->owner)->postJson('/api/v1/assistant/messages', ['message' => ''])->assertUnprocessable();
    $this->actingAs($this->owner)->postJson('/api/v1/assistant/messages', ['message' => str_repeat('a', 20000)])->assertUnprocessable();
});

it('refuses cash balances written as exponents, hex, with separators or past the column, without a 500', function (): void {
    foreach (['1e5', '0x1A', '999999999999.9996', '1.2345', '1,000'] as $amount) {
        $this->actingAs($this->owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => $amount])
            ->assertUnprocessable();
    }

    $this->actingAs($this->owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => 0.0000001])->assertUnprocessable();
    $this->actingAs($this->owner)->putJson('/api/v1/forecasts/cash/balance', ['amount' => 1250.5])->assertOk()
        ->assertJsonPath('data.cash_balance', '1250.500');
});

it('refuses an import with no file, and one that is not a spreadsheet', function (): void {
    $this->actingAs($this->owner)->postJson('/api/v1/imports/preview', ['kind' => 'orders'])->assertUnprocessable();

    $file = UploadedFile::fake()->create('evil.php', 10, 'application/x-php');
    $this->actingAs($this->owner)->post('/api/v1/imports/preview', ['kind' => 'orders', 'file' => $file], ['Accept' => 'application/json'])->assertUnprocessable();
});

it('refuses to let a staff user read another role list or the summary', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();

    $this->actingAs($staff)->getJson('/api/v1/activity/summary')->assertForbidden();
    $this->actingAs($staff)->getJson('/api/v1/forecasts/cash')->assertForbidden();
    $this->actingAs($staff)->getJson('/api/v1/reports/financing')->assertForbidden();
});

it('never lets a staff user see suggested order cost in the stock forecast', function (): void {
    $staff = User::factory()->role(Role::Staff)->create();
    Product::factory()->withStock(1)->create();

    $items = $this->actingAs($staff)->getJson('/api/v1/forecasts/stock')->assertOk()->json('data.items');

    foreach ($items as $item) {
        expect($item['suggested_cost'])->toBeNull();
    }
});
