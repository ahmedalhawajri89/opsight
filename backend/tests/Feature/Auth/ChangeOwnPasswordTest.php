<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\User;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;

/*
|--------------------------------------------------------------------------
| A user changes their own password
|--------------------------------------------------------------------------
|
| Every role may, which is the point: only an Owner could before, so the
| member of staff who most needs to act quickly had to ask someone else.
|
*/

beforeEach(function (): void {
    RateLimiter::clear('password');

    $this->staff = User::factory()->role(Role::Staff)->create([
        'password' => Hash::make('the-old-passphrase'),
        'remember_token' => 'old-remember-token',
    ]);
});

it('changes the password when the current one is given', function (): void {
    $this->actingAs($this->staff)
        ->patchJson('/api/v1/me/password', [
            'current_password' => 'the-old-passphrase',
            'password' => 'a-brand-new-passphrase',
        ])
        ->assertNoContent();

    $fresh = $this->staff->fresh();

    expect(Hash::check('a-brand-new-passphrase', $fresh->password))->toBeTrue()
        // Every remembered device is ended: the old token can no longer sign anyone in.
        ->and($fresh->remember_token)->not->toBe('old-remember-token');
});

it('refuses a wrong current password, and changes nothing', function (): void {
    $this->actingAs($this->staff)
        ->patchJson('/api/v1/me/password', [
            'current_password' => 'not-the-password',
            'password' => 'a-brand-new-passphrase',
        ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('current_password');

    expect(Hash::check('the-old-passphrase', $this->staff->fresh()->password))->toBeTrue();
});

it('holds a self-set password to the same policy, and refuses the old one', function (): void {
    $this->actingAs($this->staff)
        ->patchJson('/api/v1/me/password', ['current_password' => 'the-old-passphrase', 'password' => 'short'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('password');

    // Changing a password to itself is not changing it.
    $this->patchJson('/api/v1/me/password', [
        'current_password' => 'the-old-passphrase',
        'password' => 'the-old-passphrase',
    ])->assertUnprocessable()->assertJsonValidationErrors('password');

    expect(Hash::check('the-old-passphrase', $this->staff->fresh()->password))->toBeTrue();
});

it('records that a password changed, and never what it changed to', function (): void {
    $this->actingAs($this->staff)
        ->patchJson('/api/v1/me/password', [
            'current_password' => 'the-old-passphrase',
            'password' => 'a-brand-new-passphrase',
        ])
        ->assertNoContent();

    $row = ActivityLog::query()->where('action', 'user.password_changed')->sole();

    expect($row->user_id)->toBe($this->staff->id)
        ->and(json_encode([$row->changes, $row->context]))->not->toContain('passphrase');
});

it('keeps the device that changed it signed in', function (): void {
    $this->actingAs($this->staff)
        ->patchJson('/api/v1/me/password', [
            'current_password' => 'the-old-passphrase',
            'password' => 'a-brand-new-passphrase',
        ])
        ->assertNoContent();

    // The session survives: the person who just proved who they are is not
    // thrown out for securing their account.
    $this->asNewRequest()->getJson('/api/v1/me')->assertOk()->assertJsonPath('data.id', $this->staff->id);
});

it('lets the new password sign in, and the old one no longer', function (): void {
    $this->actingAs($this->staff)
        ->patchJson('/api/v1/me/password', [
            'current_password' => 'the-old-passphrase',
            'password' => 'a-brand-new-passphrase',
        ])
        ->assertNoContent();

    $this->postJson('/api/v1/auth/logout')->assertNoContent();
    $this->asNewRequest();

    expect(Auth::guard('web')->validate(['email' => $this->staff->email, 'password' => 'the-old-passphrase']))->toBeFalse()
        ->and(Auth::guard('web')->validate(['email' => $this->staff->email, 'password' => 'a-brand-new-passphrase']))->toBeTrue();
});

it('limits how fast it can be tried', function (): void {
    $this->actingAs($this->staff);

    foreach (range(1, 5) as $ignored) {
        $this->patchJson('/api/v1/me/password', ['current_password' => 'wrong', 'password' => 'a-brand-new-passphrase'])
            ->assertUnprocessable();
    }

    $this->patchJson('/api/v1/me/password', ['current_password' => 'wrong', 'password' => 'a-brand-new-passphrase'])
        ->assertStatus(429);
});
