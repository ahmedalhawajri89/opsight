<?php

declare(strict_types=1);

use App\Models\Business;
use App\Models\Integration;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;

/*
|--------------------------------------------------------------------------
| A connected account, and the tokens that make it dangerous (ADR-027)
|--------------------------------------------------------------------------
|
| A refresh token is a standing grant to read a business's entire order
| history from its store. The threat is a copy of the database leaving the
| server — a dump, a backup, a stolen laptop — so these assert against the
| RAW COLUMN, not against the model, because the model would decrypt and
| cheerfully prove nothing.
|
*/

function connect(string $token = 'salla-access-token-abc123', string $refresh = 'salla-refresh-token-xyz789'): Integration
{
    return Integration::query()->create([
        'provider' => 'salla',
        'external_account_id' => 'store-1',
        'status' => Integration::STATUS_CONNECTED,
        'access_token' => $token,
        'refresh_token' => $refresh,
        'scopes' => ['orders.read', 'products.read'],
    ]);
}

it('stores no token the database can read', function (): void {
    $integration = connect();

    $raw = DB::table('integrations')->where('id', $integration->id)->first();

    expect($raw->access_token)->not->toBe('salla-access-token-abc123')
        ->and($raw->refresh_token)->not->toBe('salla-refresh-token-xyz789')
        // Not merely different: no fragment of the token survives in the
        // ciphertext, which rules out an encoding that only looks scrambled.
        ->and(str_contains((string) $raw->access_token, 'abc123'))->toBeFalse()
        ->and(str_contains((string) $raw->refresh_token, 'xyz789'))->toBeFalse()
        ->and((string) $raw->access_token)->not->toBe('');
});

it('gives the token back intact to the application', function (): void {
    $integration = connect();

    $fresh = Integration::query()->findOrFail($integration->id);

    expect($fresh->access_token)->toBe('salla-access-token-abc123')
        ->and($fresh->refresh_token)->toBe('salla-refresh-token-xyz789')
        ->and($fresh->scopes)->toBe(['orders.read', 'products.read']);
});

it('keeps the tokens out of anything serialised', function (): void {
    /*
     * The cast decrypts transparently, so a resource or a log line that
     * reaches for toArray() would hand the plaintext straight out. Hidden
     * here means getting at a token has to be deliberate.
     */
    $json = connect()->toJson();

    expect(str_contains($json, 'abc123'))->toBeFalse()
        ->and(str_contains($json, 'xyz789'))->toBeFalse()
        ->and(str_contains($json, 'access_token'))->toBeFalse();
});

it('belongs to one business, and is invisible from another', function (): void {
    $mine = connect();

    $other = Business::query()->create(['name' => 'Al Noor Trading', 'slug' => 'al-noor-'.uniqid()]);

    $seenFromThere = CurrentBusiness::get()->run(
        $other->id,
        fn (): int => Integration::query()->count(),
    );

    expect($seenFromThere)->toBe(0)
        ->and(Integration::query()->count())->toBe(1)
        ->and(
            Integration::query()->withoutGlobalScope(BusinessScope::class)->count()
        )->toBe(1)
        ->and($mine->business_id)->toBe(CurrentBusiness::get()->id());
});

it('lets two businesses connect the same provider, and refuses one business twice', function (): void {
    connect();

    $other = Business::query()->create(['name' => 'Al Noor Trading', 'slug' => 'al-noor-'.uniqid()]);

    // Two businesses, same provider: ordinary.
    CurrentBusiness::get()->run($other->id, fn () => Integration::query()->create([
        'provider' => 'salla',
        'external_account_id' => 'store-2',
        'status' => Integration::STATUS_CONNECTED,
    ]));

    expect(Integration::query()->withoutGlobalScope(BusinessScope::class)->count())->toBe(2);

    // The same business twice is a reconnection, not a second integration.
    expect(fn () => connect())->toThrow(QueryException::class);
});

it('knows when its access token is past its stated life', function (): void {
    $live = connect();
    $live->forceFill(['token_expires_at' => now()->addHour()])->save();

    $stale = Integration::query()->findOrFail($live->id);
    expect($stale->tokenHasExpired())->toBeFalse()
        ->and($stale->isUsable())->toBeTrue();

    $live->forceFill(['token_expires_at' => now()->subMinute()])->save();

    expect(Integration::query()->findOrFail($live->id)->tokenHasExpired())->toBeTrue();
});

it('is not usable once revoked, whatever token it still holds', function (): void {
    $integration = connect();
    $integration->forceFill(['status' => Integration::STATUS_REVOKED])->save();

    expect($integration->fresh()->isUsable())->toBeFalse();
});
