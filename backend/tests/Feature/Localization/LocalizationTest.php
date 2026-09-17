<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\Customer;
use App\Models\User;
use App\Support\Localization\Localizer;
use Tests\Support\InsightFixture;

/*
|--------------------------------------------------------------------------
| Arabic, end to end on the server
|--------------------------------------------------------------------------
|
| The server writes sentences of its own. These tests hold that a reader who
| chose Arabic gets Arabic from every one of them — and that the figures
| inside those sentences use the digits they chose, because an Arabic sentence
| carrying "22.4%" in the middle is exactly the half-translated result that
| makes a localization look like an afterthought.
|
*/

function arabicUser(Role $role = Role::Owner, string $numerals = 'latn'): User
{
    $user = User::factory()->role($role)->create();
    $user->forceFill(['locale' => 'ar', 'numerals' => $numerals])->save();

    return $user;
}

const ARABIC_SCRIPT = '/[\x{0600}-\x{06FF}]/u';
const WESTERN_DIGIT = '/[0-9]/';
const ARABIC_INDIC_DIGIT = '/[\x{0660}-\x{0669}]/u';

/* -------------------------------------------------------------------------- */
/* Choosing the language */
/* -------------------------------------------------------------------------- */

it('answers a signed-in user in their saved language', function (): void {
    $user = arabicUser();

    $this->actingAs($user)
        ->getJson('/api/v1/me')
        ->assertOk()
        ->assertHeader('Content-Language', 'ar')
        ->assertJsonPath('data.locale', 'ar')
        ->assertJsonPath('data.role_label', 'مالك');
});

it('prefers the saved language over the browser header', function (): void {
    // A user who chose Arabic gets Arabic even from an English browser.
    $user = arabicUser();

    $this->actingAs($user)
        ->withHeader('Accept-Language', 'en-GB,en;q=0.9')
        ->getJson('/api/v1/me')
        ->assertHeader('Content-Language', 'ar');
});

it('answers a signed-out visitor in the language of the page they are on', function (): void {
    // The sign-in screen has no user yet, so the client's language decides.
    User::factory()->create(['email' => 'layla@opsight.test']);

    $response = $this->withHeader('Accept-Language', 'ar')
        ->postJson('/api/v1/auth/login', [
            'email' => 'layla@opsight.test',
            'password' => 'wrong-password',
        ])
        ->assertStatus(422)
        ->assertHeader('Content-Language', 'ar');

    expect($response->json('errors.email.0'))->toBe('بيانات الدخول غير صحيحة.');
});

it('keeps unknown-email and wrong-password refusals identical in Arabic too', function (): void {
    // SECURITY.md §15.8 holds in every language, or the translation reopens
    // the enumeration hole the English message was written to close.
    User::factory()->create(['email' => 'layla@opsight.test']);

    $wrongPassword = $this->withHeader('Accept-Language', 'ar')->postJson('/api/v1/auth/login', [
        'email' => 'layla@opsight.test',
        'password' => 'wrong-password',
    ]);

    $unknownEmail = $this->withHeader('Accept-Language', 'ar')->postJson('/api/v1/auth/login', [
        'email' => 'nobody@opsight.test',
        'password' => 'wrong-password',
    ]);

    expect($unknownEmail->json())->toBe($wrongPassword->json());
});

it('falls back to English for a language the application does not have', function (): void {
    $this->withHeader('Accept-Language', 'fr-FR')
        ->getJson('/api/v1/health')
        ->assertHeader('Content-Language', 'en');
});

/* -------------------------------------------------------------------------- */
/* Saving the preference */
/* -------------------------------------------------------------------------- */

it('lets any signed-in user choose their own language and digits', function (string $role): void {
    $user = User::factory()->role(Role::from($role))->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me/preferences', ['locale' => 'ar', 'numerals' => 'arab'])
        ->assertOk()
        // The confirmation already arrives in the language just chosen.
        ->assertHeader('Content-Language', 'ar')
        ->assertJsonPath('data.locale', 'ar')
        ->assertJsonPath('data.numerals', 'arab');

    expect($user->refresh()->locale)->toBe('ar');
})->with(['owner', 'manager', 'analyst', 'staff']);

it('rejects a language or numbering system the application does not support', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->patchJson('/api/v1/me/preferences', ['locale' => 'fr', 'numerals' => 'roman'])
        ->assertStatus(422)
        ->assertJsonValidationErrors(['locale', 'numerals']);
});

it('cannot be used to change anything but the preferences', function (): void {
    // SECURITY.md §6: an endpoint every role can reach must not be a side door
    // to a role or an identity.
    $staff = User::factory()->role(Role::Staff)->create(['name' => 'Yousif']);

    $this->actingAs($staff)->patchJson('/api/v1/me/preferences', [
        'locale' => 'ar',
        'role' => 'owner',
        'name' => 'Hijacked',
        'is_active' => false,
    ])->assertOk();

    $staff->refresh();

    expect($staff->role)->toBe(Role::Staff)
        ->and($staff->name)->toBe('Yousif')
        ->and($staff->is_active)->toBeTrue();
});

it('audits a preference change', function (): void {
    $user = User::factory()->create();

    $this->actingAs($user)->patchJson('/api/v1/me/preferences', ['locale' => 'ar'])->assertOk();

    $log = ActivityLog::query()->where('action', 'user.updated')->latest('id')->first();

    expect($log->changes['after'])->toBe(['locale' => 'ar']);
});

/* -------------------------------------------------------------------------- */
/* Server-written sentences */
/* -------------------------------------------------------------------------- */

it('writes validation messages in Arabic, naming the field in Arabic', function (): void {
    $owner = arabicUser();

    $response = $this->actingAs($owner)
        ->postJson('/api/v1/customers', ['email' => 'not-an-email'])
        ->assertStatus(422);

    $message = $response->json('errors.email.0');

    expect($message)->toMatch(ARABIC_SCRIPT)
        // The column name must not leak: "حقل email مطلوب" reads as a system
        // exposing its internals.
        ->and($message)->toContain('البريد الإلكتروني')
        ->and($message)->not->toContain('email');
});

it('writes business-rule refusals in Arabic, keeping the stable code', function (): void {
    $owner = arabicUser();

    $response = $this->actingAs($owner)
        ->postJson("/api/v1/users/{$owner->id}/deactivate")
        ->assertStatus(409);

    // The code is the contract and never translates; only the sentence does.
    expect($response->json('code'))->toBe('users.last_owner')
        ->and($response->json('message'))->toMatch(ARABIC_SCRIPT);
});

it('writes an insight in Arabic with Western digits by default', function (): void {
    InsightFixture::build(currentUnitPrice: 70.0, previousUnitPrice: 100.0);

    $owner = arabicUser();

    $response = $this->actingAs($owner)->getJson(sprintf(
        '/api/v1/insights?preset=custom&from=%s&to=%s',
        InsightFixture::CURRENT_FROM,
        InsightFixture::CURRENT_TO,
    ))->assertOk();

    $drop = collect($response->json('data'))->firstWhere('id', 'revenue_drop');

    expect($drop['title'])->toBe('انخفاض صافي الإيرادات')
        ->and($drop['message'])->toContain('30.0%')
        ->and($drop['message'])->toContain('بالفترة السابقة');
});

it('writes the figures in an insight in Arabic-Indic digits when chosen', function (): void {
    InsightFixture::build(currentUnitPrice: 70.0, previousUnitPrice: 100.0);

    $owner = arabicUser(numerals: 'arab');

    $response = $this->actingAs($owner)->getJson(sprintf(
        '/api/v1/insights?preset=custom&from=%s&to=%s',
        InsightFixture::CURRENT_FROM,
        InsightFixture::CURRENT_TO,
    ))->assertOk();

    $message = collect($response->json('data'))->firstWhere('id', 'revenue_drop')['message'];

    expect($message)->toMatch(ARABIC_INDIC_DIGIT)
        ->and($message)->not->toMatch(WESTERN_DIGIT);
});

it('agrees the counted noun with the number in Arabic comparison phrases', function (): void {
    $owner = arabicUser();

    $label = fn (string $from, string $to): string => $this->actingAs($owner)
        ->getJson("/api/v1/analytics/summary?preset=custom&from={$from}&to={$to}")
        ->json('meta.comparison.label');

    // One day, two days, 3–10 days and 11+ days take four different forms.
    expect($label('2026-07-10', '2026-07-10'))->toBe('مقارنة باليوم السابق')
        ->and($label('2026-07-10', '2026-07-11'))->toBe('مقارنة باليومين السابقين')
        ->and($label('2026-07-01', '2026-07-07'))->toBe('مقارنة بالأيام الـ 7 السابقة')
        ->and($label('2026-07-01', '2026-07-30'))->toBe('مقارنة بالـ 30 يومًا السابقة');
});

it('writes CSV column headers in the requester\'s language', function (): void {
    $analyst = arabicUser(Role::Analyst);
    Customer::factory()->create();

    $response = $this->actingAs($analyst)->get('/api/v1/customers/export')->assertOk();

    ob_start();
    $response->baseResponse->sendContent();
    $body = (string) ob_get_clean();

    expect($body)->toContain('الاسم')->and($body)->toContain('البريد الإلكتروني');
});

/* -------------------------------------------------------------------------- */
/* The number formatter */
/* -------------------------------------------------------------------------- */

it('formats numbers, percentages and points in the chosen digits', function (): void {
    $localizer = new Localizer;

    $localizer->use('ar', 'arab');
    expect($localizer->percent(0.224))->toBe('٢٢٫٤٪')
        ->and($localizer->number(1234))->toBe('١٬٢٣٤')
        ->and($localizer->points(-0.042))->toBe('٤٫٢');

    $localizer->use('ar', 'latn');
    expect($localizer->percent(0.224))->not->toMatch(ARABIC_INDIC_DIGIT);

    $localizer->use('en', 'latn');
    expect($localizer->percent(-0.224))->toBe('22.4%');
});

it('refuses to switch to an unsupported language rather than half-applying it', function (): void {
    $localizer = new Localizer;
    $localizer->use('fr', 'roman');

    expect($localizer->locale())->toBe('en')->and($localizer->numerals())->toBe('latn');
});
