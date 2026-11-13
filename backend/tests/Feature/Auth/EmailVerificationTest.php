<?php

declare(strict_types=1);

use App\Mail\MorningBriefMail;
use App\Models\User;
use App\Notifications\VerifyEmailNotification;
use App\Support\Auth\EmailVerification;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;

/*
|--------------------------------------------------------------------------
| Confirming an email address (security audit, 2026-11-13)
|--------------------------------------------------------------------------
|
| Sign-up takes any address. Two things trusted it anyway: Google sign-in,
| which let the address's real owner into an account someone else opened
| with a password of their own, and the morning brief, which mailed it.
|
*/

/** The query of a confirmation link, as the frontend posts it back. */
function linkParts(string $url): array
{
    parse_str((string) parse_url($url, PHP_URL_QUERY), $query);

    return $query;
}

it('sends a confirmation link on sign-up, and the account starts unconfirmed', function (): void {
    Notification::fake();
    RateLimiter::clear('register');

    $response = $this->postJson('/api/v1/auth/register', [
        'business_name' => 'Gulf Pearl Trading',
        'name' => 'Maryam Al Khalifa',
        'email' => 'maryam@gulfpearl.test',
        'password' => 'a-long-enough-passphrase',
    ])->assertCreated();

    $response->assertJsonPath('data.email_verified', false);

    $user = User::query()->withoutGlobalScopes()->where('email', 'maryam@gulfpearl.test')->sole();

    Notification::assertSentTo($user, VerifyEmailNotification::class, function (VerifyEmailNotification $n): bool {
        return str_contains($n->url, '/verify-email?');
    });
});

it('confirms the address from the link, signed in or not', function (): void {
    $user = User::factory()->unverified()->create();
    $link = linkParts(app(EmailVerification::class)->linkFor($user));

    $this->postJson('/api/v1/auth/email/verify', $link)->assertOk();

    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
});

it('refuses a forged, an expired, and an out-of-date link alike', function (): void {
    $user = User::factory()->unverified()->create();
    $link = linkParts(app(EmailVerification::class)->linkFor($user));

    // Forged: the signature for another account.
    $this->postJson('/api/v1/auth/email/verify', [...$link, 'id' => $user->id + 1000])->assertStatus(422);

    // Expired.
    $this->travel(EmailVerification::VALID_MINUTES + 1)->minutes();
    $this->postJson('/api/v1/auth/email/verify', $link)->assertStatus(422);
    $this->travelBack();

    // Sent to an address the account no longer has.
    $user->forceFill(['email' => 'changed@opsight.test'])->save();
    $this->postJson('/api/v1/auth/email/verify', $link)->assertStatus(422);

    expect($user->fresh()->hasVerifiedEmail())->toBeFalse();
});

it('sends another link to a signed-in account on request, and none once confirmed', function (): void {
    Notification::fake();

    $unconfirmed = User::factory()->unverified()->create();
    $this->actingAs($unconfirmed)->postJson('/api/v1/me/email/verification')->assertStatus(202);
    Notification::assertSentTo($unconfirmed, VerifyEmailNotification::class);

    $confirmed = User::factory()->create();
    $this->actingAs($confirmed)->postJson('/api/v1/me/email/verification')->assertStatus(202);
    Notification::assertNotSentTo($confirmed, VerifyEmailNotification::class);
});

it('treats a completed password reset as proof of the address', function (): void {
    $user = User::factory()->unverified()->create();
    $token = Password::broker()->createToken($user);

    $this->postJson('/api/v1/auth/reset-password', [
        'email' => $user->email,
        'token' => $token,
        'password' => 'a-brand-new-passphrase',
        'password_confirmation' => 'a-brand-new-passphrase',
    ])->assertOk();

    expect($user->fresh()->hasVerifiedEmail())->toBeTrue();
});

it('will not sign anyone in through Google to an account whose address was never confirmed', function (): void {
    config(['services.google.client_id' => 'test-client.apps.googleusercontent.com']);

    // Opened by someone else in this address's name, with their own password.
    $trap = User::factory()->unverified()->create(['email' => 'victim@google.test']);

    Http::fake([
        'oauth2.googleapis.com/*' => Http::response([
            'aud' => 'test-client.apps.googleusercontent.com',
            'iss' => 'https://accounts.google.com',
            'exp' => (string) (time() + 600),
            'email' => 'victim@google.test',
            'email_verified' => 'true',
            'sub' => '1234567890',
        ]),
    ]);

    $this->postJson('/api/v1/auth/google', ['credential' => 'a-google-token'])
        ->assertStatus(422)
        ->assertJsonPath('errors.credential.0', __('auth.google_unverified'));

    $this->assertGuest();
    expect($trap->fresh()->last_login_at)->toBeNull();
});

it('does not mail the morning brief to an address that was never confirmed', function (): void {
    Mail::fake();

    $user = User::factory()->owner()->unverified()->create();

    $this->actingAs($user)->postJson('/api/v1/me/brief/test')
        ->assertStatus(422)
        ->assertJsonPath('message', __('brief.email_unverified'));

    Mail::assertNothingSent();
    Mail::assertNotSent(MorningBriefMail::class);
});
