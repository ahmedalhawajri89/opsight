<?php

declare(strict_types=1);

use App\Authorization\Role;
use App\Models\ActivityLog;
use App\Models\Business;
use App\Models\Integration;
use App\Models\UnclaimedIntegration;
use App\Models\User;
use App\Support\Tenancy\BusinessScope;
use App\Support\Tenancy\CurrentBusiness;
use Carbon\CarbonImmutable;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Support\Facades\RateLimiter;

/*
|--------------------------------------------------------------------------
| Claiming a store (P2 phase 6)
|--------------------------------------------------------------------------
|
| Salla's Easy mode gives an app no way to tell which of its own accounts an
| installation belongs to, so the merchant says so afterwards — with the
| store id Salla shows them, which is an identifier and not a secret.
|
| That makes this the weakest point in the integration, and these tests are
| about the four things that make it acceptable anyway: the window is an
| hour, the claim happens once, a store already connected cannot be taken,
| and every attempt is recorded. The refusals are deliberately identical, so
| the last group checks that too.
|
*/

function pendingStore(string $storeId = '1305146709', array $overrides = []): UnclaimedIntegration
{
    return UnclaimedIntegration::query()->create(array_replace([
        'provider' => 'salla',
        'external_account_id' => $storeId,
        'access_token' => 'an-access-token',
        'refresh_token' => 'a-refresh-token',
        'token_expires_at' => CarbonImmutable::now()->addDays(14),
        'scopes' => ['offline_access', 'orders.read_write'],
        'expires_at' => CarbonImmutable::now()->addMinutes(30),
    ], $overrides));
}

beforeEach(function (): void {
    RateLimiter::clear('integration-claim');

    $this->owner = User::factory()->role(Role::Owner)->create();
});

describe('claiming', function (): void {
    it('connects a waiting store to the business that claims it', function (): void {
        pendingStore();

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertCreated()
            ->assertJsonPath('data.store_id', '1305146709')
            ->assertJsonPath('data.status', Integration::STATUS_CONNECTED);

        $integration = Integration::query()->sole();

        expect($integration->business_id)->toBe($this->owner->business_id)
            ->and($integration->access_token)->toBe('an-access-token');
    });

    it('leaves the tokens in exactly one place', function (): void {
        pendingStore();

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertCreated();

        // Moved, not copied: the pending row and the connection must never
        // both hold a live key to the same shop.
        expect(UnclaimedIntegration::query()->count())->toBe(0);
    });

    it('never puts a token in the response', function (): void {
        pendingStore();

        $response = $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709']);

        $body = $response->getContent();

        expect($body)->not->toContain('an-access-token')
            ->and($body)->not->toContain('a-refresh-token')
            // The question a screen actually asks, in place of the token.
            ->and($response->json('data.can_refresh'))->toBeTrue();
    });

    it('records the claim, with the store it was for', function (): void {
        pendingStore();

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertCreated();

        $entry = ActivityLog::query()->where('action', 'integration.claimed')->sole();

        expect($entry->context['store_id'])->toBe('1305146709');
    });
});

describe('refusing', function (): void {
    it('refuses a store that is already another business\'s', function (): void {
        // The one thing this must never allow: taking over a connected shop
        // by naming it.
        $theirs = Business::factory()->create();

        CurrentBusiness::get()->run($theirs->id, fn () => Integration::query()->create([
            'provider' => 'salla',
            'external_account_id' => '1305146709',
            'status' => Integration::STATUS_CONNECTED,
            'access_token' => 'their-token',
        ]));

        pendingStore();

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertNotFound()
            ->assertJsonPath('code', 'integration.not_claimable');

        expect(Integration::query()->withoutGlobalScope(BusinessScope::class)->count())->toBe(1);
    });

    it('refuses a store whose hour has passed', function (): void {
        pendingStore(overrides: ['expires_at' => CarbonImmutable::now()->subMinute()]);

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertNotFound();

        expect(Integration::query()->count())->toBe(0);
    });

    it('cannot be claimed twice', function (): void {
        pendingStore();

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertCreated();

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertNotFound();
    });

    it('says the same thing however it refuses', function (): void {
        // Absent, expired and taken answer identically. Telling an owner
        // which store ids exist, or which are taken, would turn this into a
        // way to enumerate other people's shops.
        $absent = $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '999999999']);

        pendingStore('888888888', ['expires_at' => CarbonImmutable::now()->subMinute()]);

        $expired = $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '888888888']);

        expect($absent->status())->toBe($expired->status())
            ->and($absent->json('message'))->toBe($expired->json('message'))
            ->and($absent->json('code'))->toBe($expired->json('code'));
    });

    it('records an attempt that found nothing', function (): void {
        // Especially because nothing happened: a run of these from one
        // account is somebody trying store ids, and this is where it shows.
        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '999999999'])
            ->assertNotFound();

        expect(ActivityLog::query()->where('action', 'integration.claim_failed')->count())->toBe(1);
    });

    it('refuses a provider this installation does not accept', function (): void {
        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'shopify', 'store_id' => '1'])
            ->assertStatus(422);
    });

    it('stops an account that keeps guessing', function (): void {
        // Ten an hour: far more than connecting one's own shop needs, far too
        // few to find a pending store inside the hour it is claimable.
        for ($attempt = 0; $attempt < 10; $attempt++) {
            $this->actingAs($this->owner)
                ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => (string) $attempt])
                ->assertNotFound();
        }

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '11'])
            ->assertStatus(429);
    });
});

describe('who may', function (): void {
    it('is closed to every role but the Owner', function (string $role): void {
        $user = User::factory()->role(Role::from($role))->create();

        pendingStore();

        $this->actingAs($user)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertForbidden();

        $this->actingAs($user)->getJson('/api/v1/integrations')->assertForbidden();
    })->with(['manager', 'analyst', 'staff']);
});

describe('disconnecting', function (): void {
    it('takes the tokens with it', function (): void {
        pendingStore();

        $id = $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->json('data.id');

        $this->actingAs($this->owner)->deleteJson("/api/v1/integrations/{$id}")->assertNoContent();

        // A disconnection that left a working key behind would be a
        // disconnection in name only.
        expect(Integration::query()->withoutGlobalScope(BusinessScope::class)->count())->toBe(0)
            ->and(ActivityLog::query()->where('action', 'integration.disconnected')->count())->toBe(1);
    });

    it('frees the store to be claimed again', function (): void {
        // This is the undo for a store claimed in error, so it has to leave
        // the store claimable — by its real owner.
        pendingStore();

        $id = $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->json('data.id');

        $this->actingAs($this->owner)->deleteJson("/api/v1/integrations/{$id}")->assertNoContent();

        pendingStore();

        $this->actingAs($this->owner)
            ->postJson('/api/v1/integrations/claim', ['provider' => 'salla', 'store_id' => '1305146709'])
            ->assertCreated();
    });
});

describe('tokens nobody claimed', function (): void {
    it('are discarded once their hour is up', function (): void {
        pendingStore('1', ['expires_at' => CarbonImmutable::now()->subMinutes(5)]);
        pendingStore('2', ['expires_at' => CarbonImmutable::now()->addMinutes(5)]);

        $this->artisan('opsight:prune-unclaimed-integrations')->assertSuccessful();

        // The live one stays; the dead key goes.
        expect(UnclaimedIntegration::query()->pluck('external_account_id')->all())->toBe(['2']);
    });

    it('are swept hourly, because the window they are usable for is an hour', function (): void {
        $events = collect(app(Schedule::class)->events())
            ->filter(fn ($event): bool => str_contains((string) $event->command, 'prune-unclaimed-integrations'));

        expect($events)->toHaveCount(1)
            ->and($events->first()->expression)->toBe('0 * * * *');
    });
});
