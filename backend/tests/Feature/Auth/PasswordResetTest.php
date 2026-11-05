<?php

declare(strict_types=1);

use App\Models\ActivityLog;
use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Facades\RateLimiter;

/*
|--------------------------------------------------------------------------
| A forgotten password
|--------------------------------------------------------------------------
|
| Two public endpoints: one sends a link, one takes a new password from it.
| The first must never say whether an address has an account, and the second
| must never let a reset become a way around deactivation or the policy.
|
*/

beforeEach(function (): void {
    RateLimiter::clear('password-reset');
    Notification::fake();

    $this->user = User::factory()->create([
        'email' => 'owner@reset.test',
        'password' => Hash::make('the-old-passphrase'),
        'remember_token' => 'old-remember-token',
        'locale' => 'ar',
    ]);
});

/** A real token for the user, as the emailed link would carry it. */
function resetTokenFor(User $user): string
{
    return Password::broker()->createToken($user);
}

it('sends a link to an active account, in the account’s own language', function (): void {
    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'owner@reset.test'])
        ->assertStatus(202);

    Notification::assertSentTo(
        $this->user,
        ResetPasswordNotification::class,
        fn (ResetPasswordNotification $notification): bool => $notification->locale === 'ar',
    );
});

it('links to the frontend’s reset screen, carrying the token and the address', function (): void {
    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'owner@reset.test']);

    Notification::assertSentTo($this->user, ResetPasswordNotification::class, function ($notification): bool {
        $url = $notification->toMail($this->user)->actionUrl;

        return str_starts_with($url, rtrim((string) config('app.frontend_url'), '/').'/reset-password?')
            && str_contains($url, 'token='.$notification->token)
            && str_contains($url, 'email='.urlencode('owner@reset.test'));
    });
});

it('answers an unknown address exactly as it answers a real one', function (): void {
    $real = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'owner@reset.test']);
    $unknown = $this->postJson('/api/v1/auth/forgot-password', ['email' => 'ghost@reset.test']);

    expect($unknown->status())->toBe($real->status())
        ->and($unknown->json())->toEqual($real->json());

    Notification::assertSentTimes(ResetPasswordNotification::class, 1);
});

it('sends nothing to a deactivated account, and says so to nobody', function (): void {
    User::factory()->inactive()->create(['email' => 'gone@reset.test']);

    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'gone@reset.test'])
        ->assertStatus(202)
        ->assertJsonPath('message', __('auth.reset_link_sent'));

    Notification::assertNothingSent();
});

it('sends nothing for the demo’s shared accounts', function (): void {
    config(['demo.enabled' => true, 'demo.accounts' => ['owner@reset.test']]);

    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'owner@reset.test'])
        ->assertStatus(202);

    Notification::assertNothingSent();
});

it('sets a new password from a valid link, ends remembered devices, and does not sign in', function (): void {
    $this->postJson('/api/v1/auth/reset-password', [
        'token' => resetTokenFor($this->user),
        'email' => 'owner@reset.test',
        'password' => 'a-brand-new-passphrase',
    ])->assertOk();

    $fresh = $this->user->fresh();

    expect(Hash::check('a-brand-new-passphrase', $fresh->password))->toBeTrue()
        ->and($fresh->remember_token)->not->toBe('old-remember-token');

    $this->assertGuest();
});

it('spends a link once', function (): void {
    $token = resetTokenFor($this->user);

    $this->postJson('/api/v1/auth/reset-password', [
        'token' => $token, 'email' => 'owner@reset.test', 'password' => 'a-brand-new-passphrase',
    ])->assertOk();

    $this->postJson('/api/v1/auth/reset-password', [
        'token' => $token, 'email' => 'owner@reset.test', 'password' => 'yet-another-passphrase',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');

    expect(Hash::check('a-brand-new-passphrase', $this->user->fresh()->password))->toBeTrue();
});

it('refuses a forged token and an address that does not match it with one message', function (): void {
    $forged = $this->postJson('/api/v1/auth/reset-password', [
        'token' => 'not-a-real-token', 'email' => 'owner@reset.test', 'password' => 'a-brand-new-passphrase',
    ])->assertUnprocessable();

    $other = User::factory()->create(['email' => 'other@reset.test']);

    $mismatched = $this->postJson('/api/v1/auth/reset-password', [
        'token' => resetTokenFor($this->user), 'email' => $other->email, 'password' => 'a-brand-new-passphrase',
    ])->assertUnprocessable();

    expect($forged->json('errors.token'))->toEqual($mismatched->json('errors.token'));
    expect(Hash::check('the-old-passphrase', $this->user->fresh()->password))->toBeTrue();
});

it('will not hand access back to a deactivated account, even with a valid token', function (): void {
    $token = resetTokenFor($this->user);
    $this->user->forceFill(['is_active' => false])->saveQuietly();

    $this->postJson('/api/v1/auth/reset-password', [
        'token' => $token, 'email' => 'owner@reset.test', 'password' => 'a-brand-new-passphrase',
    ])->assertUnprocessable()->assertJsonValidationErrors('token');

    expect(Hash::check('the-old-passphrase', $this->user->fresh()->password))->toBeTrue();
});

it('holds a new password to the same policy as every other', function (): void {
    $this->postJson('/api/v1/auth/reset-password', [
        'token' => resetTokenFor($this->user), 'email' => 'owner@reset.test', 'password' => 'short',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');
});

it('records the reset in the account’s own business, and never the password', function (): void {
    $this->postJson('/api/v1/auth/reset-password', [
        'token' => resetTokenFor($this->user), 'email' => 'owner@reset.test', 'password' => 'a-brand-new-passphrase',
    ])->assertOk();

    $row = ActivityLog::query()->withoutGlobalScopes()->where('action', 'user.password_reset')->sole();

    expect($row->business_id)->toBe($this->user->business_id)
        ->and(json_encode([$row->changes, $row->context]))->not->toContain('passphrase');
});

it('rate limits requests for links from one address', function (): void {
    foreach (range(1, 5) as $attempt) {
        $this->postJson('/api/v1/auth/forgot-password', ['email' => "someone{$attempt}@reset.test"])
            ->assertStatus(202);
    }

    $this->postJson('/api/v1/auth/forgot-password', ['email' => 'someone6@reset.test'])
        ->assertStatus(429);
});
