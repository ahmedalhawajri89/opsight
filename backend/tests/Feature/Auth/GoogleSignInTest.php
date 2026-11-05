<?php

declare(strict_types=1);

use App\Models\User;
use App\Support\Auth\GoogleIdTokens;
use Illuminate\Support\Facades\Http;

/*
|--------------------------------------------------------------------------
| Signing in with Google
|--------------------------------------------------------------------------
|
| Google checks the token's signature and expiry; this installation checks
| the rest — that the token was minted for IT, by Google, for an address
| Google has verified — and then signs in an account that already exists.
|
*/

const GOOGLE_CLIENT = 'test-client.apps.googleusercontent.com';

beforeEach(function (): void {
    config(['services.google.client_id' => GOOGLE_CLIENT]);

    $this->user = User::factory()->create(['email' => 'owner@google.test']);
});

/** Google's tokeninfo answer for a token, with any claim overridden. */
function googleSays(array $claims = [], int $status = 200): void
{
    Http::fake([
        'oauth2.googleapis.com/*' => Http::response(array_merge([
            'aud' => GOOGLE_CLIENT,
            'iss' => 'https://accounts.google.com',
            'exp' => (string) (time() + 600),
            'email' => 'owner@google.test',
            'email_verified' => 'true',
            'sub' => '1234567890',
        ], $claims), $status),
    ]);
}

it('signs in the account whose address Google verified', function (): void {
    googleSays();

    $this->postJson('/api/v1/auth/google', ['credential' => 'a-google-id-token'])
        ->assertOk()
        ->assertJsonPath('data.email', 'owner@google.test');

    $this->assertAuthenticatedAs($this->user);
    expect($this->user->fresh()->last_login_at)->not->toBeNull();
});

it('matches the address whatever case Google spells it in', function (): void {
    googleSays(['email' => 'Owner@Google.Test']);

    $this->postJson('/api/v1/auth/google', ['credential' => 'a-google-id-token'])->assertOk();

    $this->assertAuthenticatedAs($this->user);
});

it('refuses a token minted for another application', function (): void {
    googleSays(['aud' => 'someone-else.apps.googleusercontent.com']);

    $this->postJson('/api/v1/auth/google', ['credential' => 'a-google-id-token'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('credential');

    $this->assertGuest();
});

it('refuses what Google itself rejects, an unverified address, a foreign issuer and an expired token', function (array $claims, int $status): void {
    googleSays($claims, $status);

    $this->postJson('/api/v1/auth/google', ['credential' => 'a-google-id-token'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('credential');

    $this->assertGuest();
})->with([
    'rejected by Google' => [['error' => 'invalid_token'], 400],
    'unverified address' => [['email_verified' => 'false'], 200],
    'foreign issuer' => [['iss' => 'https://evil.example'], 200],
    'expired' => [['exp' => (string) (time() - 5)], 200],
]);

it('never creates an account for an address it does not know', function (): void {
    googleSays(['email' => 'stranger@google.test']);

    $this->postJson('/api/v1/auth/google', ['credential' => 'a-google-id-token'])
        ->assertUnprocessable()
        ->assertJsonPath('errors.credential.0', __('auth.google_no_account'));

    expect(User::query()->withoutGlobalScopes()->where('email', 'stranger@google.test')->exists())->toBeFalse();
    $this->assertGuest();
});

it('will not sign in a deactivated account through Google either', function (): void {
    $this->user->forceFill(['is_active' => false])->saveQuietly();
    googleSays();

    $this->postJson('/api/v1/auth/google', ['credential' => 'a-google-id-token'])->assertUnprocessable();

    $this->assertGuest();
});

it('does not exist until a client ID is configured', function (): void {
    config(['services.google.client_id' => null]);
    app()->forgetInstance(GoogleIdTokens::class);
    Http::fake();

    $this->postJson('/api/v1/auth/google', ['credential' => 'a-google-id-token'])->assertNotFound();

    Http::assertNothingSent();
});
